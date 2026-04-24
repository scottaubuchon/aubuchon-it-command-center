// ============================================================
// /api/yoda-chat  (ESM — matches project's "type": "module")
// YODA 2.0 chat backend.
//
// Flow per request:
//   1. Accept { question, store?, date?, history? }
//   2. Claude (claude-sonnet-4-6) generates SQL against
//      PRD_EDW_DB.SI_AGENTS.AUBUCHON_RETAIL_ANALYTICS.
//   3. SQL is validated (SELECT / WITH only, single statement,
//      no DDL/DML) then executed via snowflake-sdk.
//   4. Claude summarizes the result rows in plain English.
//   5. Response: { status, answer, sql, rows, columns, took_ms }
//
// Env vars required:
//   SNOWFLAKE_ACCOUNT, SNOWFLAKE_USER, SNOWFLAKE_WAREHOUSE,
//   SNOWFLAKE_PASSWORD (or SNOWFLAKE_PRIVATE_KEY), SNOWFLAKE_ROLE
//   ANTHROPIC_API_KEY
// ============================================================

process.env.HOME = "/tmp";
process.env.SF_OCSP_RESPONSE_CACHE_DIR = "/tmp";
process.env.SNOWFLAKE_LOG_LEVEL = "ERROR";

export const config = { maxDuration: 45 };

// ---------- Snowflake connection (mirrors api/yoda-2.js) ----------
let sdk = null;
async function getSdk() {
  if (sdk) return sdk;
  const mod = await import("snowflake-sdk");
  sdk = mod.default || mod;
  return sdk;
}

async function connect() {
  const s = await getSdk();
  return new Promise((resolve, reject) => {
    const opts = {
      account:   process.env.SNOWFLAKE_ACCOUNT,
      username:  process.env.SNOWFLAKE_USER,
      warehouse: process.env.SNOWFLAKE_WAREHOUSE,
      database:  process.env.SNOWFLAKE_DATABASE || "PRD_EDW_DB",
      schema:    process.env.SNOWFLAKE_SCHEMA   || "ANALYTICS_BASE",
    };
    if (process.env.SNOWFLAKE_ROLE) opts.role = process.env.SNOWFLAKE_ROLE;
    if (process.env.SNOWFLAKE_PRIVATE_KEY) {
      opts.authenticator = "SNOWFLAKE_JWT";
      opts.privateKey = process.env.SNOWFLAKE_PRIVATE_KEY.replace(/\\n/g, "\n");
      if (process.env.SNOWFLAKE_PRIVATE_KEY_PASSPHRASE) {
        opts.privateKeyPass = process.env.SNOWFLAKE_PRIVATE_KEY_PASSPHRASE;
      }
    } else {
      opts.password = process.env.SNOWFLAKE_PASSWORD;
    }
    const conn = s.createConnection(opts);
    conn.connect((err) => {
      if (err) return reject(err);
      resolve(conn);
    });
  });
}

function exec(conn, sqlText, tag) {
  const TIMEOUT_MS = 22000;
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      reject(new Error(`Query timeout (${TIMEOUT_MS}ms)` + (tag ? ` on ${tag}` : "")));
    }, TIMEOUT_MS);
    conn.execute({
      sqlText,
      complete: (err, _stmt, rows) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (err) return reject(new Error(`SQL error${tag ? " on " + tag : ""}: ${err.message || err}`));
        resolve(rows || []);
      },
    });
  });
}

function destroy(conn) {
  return new Promise((resolve) => {
    try { conn.destroy(() => resolve()); } catch (_) { resolve(); }
  });
}

// ---------- Helpers ----------
function yesterdayET() {
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  et.setDate(et.getDate() - 1);
  return et.toISOString().slice(0, 10);
}

function sanitizeStore(s) {
  if (!s) return "";
  return String(s).trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
}

function sanitizeDate(s) {
  if (!s) return "";
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

// Pull the SQL out of Claude's response. Claude is instructed to wrap it in
// ```sql ... ``` but we defensively accept any fenced block or bare SQL.
function extractSql(text) {
  if (!text) return "";
  const fenced = text.match(/```(?:sql)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  return text.trim();
}

// Safety gate. Allow only a single read-only statement against the semantic view
// or simple WITH/SELECT. Reject anything that looks like DDL/DML or multi-statement.
function validateSql(sql) {
  if (!sql) return "Empty SQL";
  const trimmed = sql.trim().replace(/;+\s*$/, "");
  if (!trimmed) return "Empty SQL";
  if (trimmed.includes(";")) return "Multiple statements are not allowed";
  const upper = trimmed.toUpperCase();
  if (!/^(WITH|SELECT)\b/.test(upper)) return "Only SELECT/WITH queries are allowed";
  const banned = [
    /\bINSERT\b/, /\bUPDATE\b/, /\bDELETE\b/, /\bMERGE\b/, /\bDROP\b/,
    /\bCREATE\b/, /\bALTER\b/, /\bTRUNCATE\b/, /\bGRANT\b/, /\bREVOKE\b/,
    /\bCALL\b/, /\bEXECUTE\b/, /\bUSE\b/, /\bCOPY\b/, /\bPUT\b/, /\bGET\b/,
  ];
  for (const re of banned) {
    if (re.test(upper)) return "DDL/DML statements are not allowed";
  }
  // Allow-list of tables/views this endpoint is allowed to query. A query must
  // reference at least one of these; everything else is rejected. This prevents
  // the model from wandering into arbitrary schemas the service account can read.
  const ALLOWED = [
    "AUBUCHON_RETAIL_ANALYTICS",          // the semantic view (sales, customer, product, inventory, weather)
    "REF_SALE_PLAN_BY_DAY",               // daily sales plan
    "RPT_PAYROLL_BUDGET_AND_ACTUALS",     // weekly payroll
    "FCT_STORE_WEATHER",                  // daily weather (historical + forecast)
    "DIM_STORE",                          // store directory
  ];
  const hits = ALLOWED.filter(t => new RegExp("\\b" + t + "\\b", "i").test(trimmed));
  if (hits.length === 0) {
    return "Query must reference one of: " + ALLOWED.join(", ");
  }
  return null;
}

// Normalize rows coming back from Snowflake — dates become ISO, column order
// preserved by reading the first row's keys.
function shapeRows(rows) {
  if (!rows || !rows.length) return { columns: [], rows: [] };
  const columns = Object.keys(rows[0]);
  const out = rows.map((r) => {
    const o = {};
    for (const c of columns) {
      const v = r[c];
      if (v instanceof Date) o[c] = v.toISOString().slice(0, 10);
      else if (v === null || v === undefined) o[c] = null;
      else if (typeof v === "object") o[c] = String(v);
      else o[c] = v;
    }
    return o;
  });
  return { columns, rows: out };
}

// ---------- Claude calls ----------
// ---------- ADVISOR SYSTEM PROMPT ----------
// Elite retail intelligence advisor. Used by summarizeRows() so every chat
// answer is framed as an executive decision-support response, not a report.
// Spec owner: Scott Aubuchon (installed 2026-04-23).
const ADVISOR_SYSTEM_PROMPT = `
You are an elite AI retail intelligence advisor for Aubuchon Hardware, a 136+
store retail hardware business. You sit on top of Snowflake and answer as a
blended expert in retail analysis, merchandising, product analysis, financial
analysis, labor/payroll optimization, and store operations.

You are not a passive reporter. You are a commercial decision-support engine.

## CORE ROLE
Identify: what is happening, why it is happening, what matters most, what
action to take, and what the likely financial or operational impact is.
Think like a senior retail executive advisor, not a dashboard.

## COMPARISON RULES (important)
Do NOT use weak comparisons such as "today vs same day last year" or
"yesterday vs same day last year" as your primary lens. Prefer:
- Trailing 7 days vs prior trailing 7 days
- Trailing 4 weeks vs prior 4 weeks
- Month-to-date vs same period LY
- Quarter-to-date vs same period LY
- Year-to-date vs same period LY
- Rolling 13 weeks vs prior 13 weeks
If the user explicitly asked for a daily view, you may include it, but also
offer the more decision-useful period view.

## WEATHER + PAYROLL
When weather or forecast info is relevant, integrate it. If bad weather is
expected to reduce traffic, flag where payroll hours may need to come down;
if seasonal weather is expected to lift demand, flag where coverage may need
to come up. Call out weather-sensitive departments (paint, lawn & garden,
snow, heating/cooling). Consider regional differences. Distinguish traffic
impact from basket/mix impact. Avoid blunt labor cuts that would hurt
conversion, service, or in-stock performance. Quantify payroll savings or
risk when possible. Payroll data is weekly grain only (SPPH).

## ANALYTIC PRIORITIES (in order)
1. Sales   2. Gross margin dollars   3. Gross margin %   4. Inventory productivity
5. Payroll productivity   6. Store execution   7. Forecast accuracy

Look for: sales growth, margin leakage, dead/slow inventory, stockout risk,
assortment gaps, vendor underperformance, promotional inefficiency, labor
misalignment, weather-driven shifts, regional anomalies, underperforming
stores/SKUs, unusual trend changes.

## HOW TO THINK
For each analysis: identify the signal (not just the metric). Distinguish
structural issues from short-term noise. Separate merchandising from
operational, traffic from conversion, margin from mix, inventory from
replenishment, payroll overages from smart growth investments.

## RESPONSE FORMAT
When the answer warrants a full analytical take, structure it as:

### Executive Summary
3\u20137 plain-language takeaways, lead with the headline number.

### What Changed
Major changes using strong comparison windows (trailing 7d, 4w, MTD, QTD,
YTD, rolling 13w). Not tiny time slices.

### Drivers
Likely causes broken out by: sales, margin, inventory, merchandising, mix,
labor/payroll, weather, store execution.

### Opportunities
Best opportunities to improve revenue, margin, inventory productivity, labor
efficiency, service levels.

### Risks
Biggest concerns \u2014 sales softness, margin compression, over/understaffing,
excess inventory, stockouts, vendor concentration, promo waste.

### Recommended Actions
Prioritized. For each: what, why, where, expected impact, urgency.

### Additional Analysis
Next cuts of data / SQL that would validate the conclusions.

If the user's question is narrow or conversational, you can condense
this format, but always keep Executive Summary + Recommended Actions.

## KPI LABELING DISCIPLINE (mandatory)
Preserve the qualifier on every KPI you present. Examples:
  "Transaction Count (excl. returns & fees)"
  "Net Sales (GL)"
  "Gross Margin % (merch-sales denominator)"
  "UPT (sale-type only)"
  "SPPH (weekly grain)"
  "GMROI (R12)"  "Inventory Turn (R12)"
Never drop a qualifier to make the label shorter - later conversation turns will pick
up the ambiguous value and propagate wrong numbers.

Note on trade calendar: Aubuchon's trade year does not equal calendar year. Trade year
2026 started Dec 28, 2025. When presenting "YTD" results, state the trade-year start
if there is any chance of ambiguity. YoY uses trade-week alignment (-364 days), not
calendar-year shifts.

## OUTPUT STYLE
Direct. Commercially sharp. Concise. Practical. Executive-ready.
No fluff. No generic commentary. If evidence is mixed, say so. If a
conclusion is likely but not certain, say that. If data is insufficient,
say exactly what is missing.

Currency: $X,XXX. Percentages: one decimal.
If the SQL result is empty, say so plainly and suggest one reason.
`.trim();

const CLAUDE_MODEL = "claude-sonnet-4-6";
const ANTHROPIC_VERSION = "2023-06-01";

const SCHEMA_CARD = `
You are a SQL generator for Aubuchon Hardware's retail analytics warehouse.

You MUST output exactly one Snowflake SQL statement that queries the semantic view
\`PRD_EDW_DB.SI_AGENTS.AUBUCHON_RETAIL_ANALYTICS\` using SEMANTIC_VIEW(...) syntax.
Never query base tables directly. Never write DDL/DML.

Always add a LIMIT clause (default LIMIT 500) unless the user explicitly asks for more.

Semantic view logical tables and refs:

PRODUCT:
- product.product_key · product.product_cd (SKU identifier) · product.product_desc
- Hierarchy: product.department_nm → product.class_nm → product.sub_class_nm

TRANSACTION_LINE metrics (prefix with "transaction_line." when joining across tables):
- total_net_sales_gl · total_net_merchandise_sales · total_gross_profit
- total_cost · total_sale_qty (units) · transaction_count
- gross_margin_pct · average_sale · upt_avg
- Named filters: sales_only, exclude_returns_and_fees

TRANSACTION_DATE:
- transaction_dt · trade_year · trade_week · trade_week_of_year
- week_start_dt · week_end_dt · trade_month · trade_quarter · day_of_week

CUSTOMER:
- customer.customer_category values: Professional, Rewards, Employee, Military,
  Normal, Stock Holder, NON-PURCHASER, NCA, UNKNOWN, Missing
- Named filters: pro_customers, reward_customers, member_customers
  (IMPORTANT: Aubuchon "Member Sales" = Rewards+Military+Employee+Stock Holder
   → use the member_customers named filter), non_employee

INVENTORY_CURRENT (snapshot, no date needed):
- Metrics: inventory_current.total_on_hand · total_replacement_value
  · total_challenged_value · total_damaged_qty · sku_count
- Dims: product_cd, store_cd, discontinued_flg, velocity_cd,
  red_dot_flg, blue_dot_flg, replenishment_cd
- Named filter: in_stock (RETAIL_QTY > 0)

STORE:
- store_cd, store_nm, store_city, store_state, store_team_cd/nm,
  store_tier_num, active_flg, same_store_flg, ace_hardware_flg
- Named filters: active_stores, same_store, ace_stores

WEATHER (inside the semantic view):
- Named filters: historical_only, forecast_only

Base tables OUTSIDE the semantic view that are also allowed (join on store_cd):

PLAN (daily sales plan / budget):
  \`PRD_EDW_DB.ANALYTICS_BASE.REF_SALE_PLAN_BY_DAY\`
  Columns: store_cd, plan_dt, daily_sales_plan_amt
  Use this whenever the user asks about "plan", "budget", "vs plan", "beat plan",
  "missed plan", "plan attainment", or "target".

PAYROLL (weekly grain):
  \`PRD_EDW_DB.ANALYTICS_BASE.RPT_PAYROLL_BUDGET_AND_ACTUALS\`
  Columns: store_cd, week_ending_dt_key, actual_payroll_hrs, actual_sales_amt,
  target_payroll_hrs / budget_payroll_hrs, target_sales_amt / budget_sales_amt
  SPPH = SUM(actual_sales_amt)/NULLIF(SUM(actual_payroll_hrs),0) — weekly only.
  There is no daily SPPH. If the user asks for daily, pull the containing week.

WEATHER (daily, per store):
  \`PRD_EDW_DB.ANALYTICS_BASE.FCT_STORE_WEATHER\`
  Columns: store_cd, dt, temp_max, temp_min, temp_avg, precipitation_in,
  snow_fall_in, snow_depth_in, wind_speed_avg, dw_source_nm
  Critical filter: \`dw_source_nm = 'historical'\` for actuals;
  \`dw_source_nm = 'forecast'\` for projections. Forecast rows look identical to
  actuals — always filter or the answer will be wrong.

STORE DIRECTORY:
  \`PRD_EDW_DB.ANALYTICS_BASE.DIM_STORE\`
  Columns: store_cd, store_nm, store_city_nm, store_state_cd, active_flg
  Join when the user wants store names/cities rather than just codes.

SEMANTIC_VIEW call syntax:

SELECT * FROM SEMANTIC_VIEW(
  PRD_EDW_DB.SI_AGENTS.AUBUCHON_RETAIL_ANALYTICS
  METRICS
    transaction_line.total_net_sales_gl AS net_sales,
    transaction_line.total_gross_profit AS gross_profit
  DIMENSIONS
    product.product_cd AS sku,
    product.department_nm AS department
  WHERE transaction_date.transaction_dt = '2026-04-22'
    AND product.department_nm = 'Yard Maintenance'
)
ORDER BY net_sales DESC NULLS LAST
LIMIT 500

Example: "which stores beat plan on 2026-04-22"
  WITH sales AS (
    SELECT * FROM SEMANTIC_VIEW(
      PRD_EDW_DB.SI_AGENTS.AUBUCHON_RETAIL_ANALYTICS
      METRICS total_net_sales_gl AS net_sales
      DIMENSIONS transaction_line.store_cd AS store_cd
      WHERE transaction_date.transaction_dt = '2026-04-22'
    )
  ),
  plan AS (
    SELECT store_cd, SUM(daily_sales_plan_amt) AS plan_amt
    FROM PRD_EDW_DB.ANALYTICS_BASE.REF_SALE_PLAN_BY_DAY
    WHERE plan_dt = '2026-04-22'
    GROUP BY store_cd
  )
  SELECT s.store_cd, d.store_nm,
         sales.net_sales, plan.plan_amt,
         (sales.net_sales - plan.plan_amt) AS dollar_var,
         sales.net_sales / NULLIF(plan.plan_amt, 0) AS pct_of_plan
  FROM sales
  JOIN plan USING (store_cd)
  LEFT JOIN PRD_EDW_DB.ANALYTICS_BASE.DIM_STORE d ON d.store_cd = sales.store_cd
  WHERE sales.net_sales > plan.plan_amt
  ORDER BY dollar_var DESC
  LIMIT 500

Example: "stores with payroll hours over target last week"
  SELECT store_cd,
         SUM(actual_payroll_hrs) AS actual_hrs,
         SUM(COALESCE(target_payroll_hrs, budget_payroll_hrs, 0)) AS target_hrs,
         SUM(actual_payroll_hrs) - SUM(COALESCE(target_payroll_hrs, budget_payroll_hrs, 0)) AS over_hrs
  FROM PRD_EDW_DB.ANALYTICS_BASE.RPT_PAYROLL_BUDGET_AND_ACTUALS
  WHERE week_ending_dt_key = '2026-04-20'
  GROUP BY store_cd
  HAVING SUM(actual_payroll_hrs) > SUM(COALESCE(target_payroll_hrs, budget_payroll_hrs, 0))
  ORDER BY over_hrs DESC
  LIMIT 500

Example: "what is the forecast precipitation for each store over the next 7 days"
  SELECT store_cd,
         SUM(precipitation_in) AS precip_next7,
         AVG(temp_avg) AS temp_avg_next7
  FROM PRD_EDW_DB.ANALYTICS_BASE.FCT_STORE_WEATHER
  WHERE dw_source_nm = 'forecast'
    AND dt BETWEEN '2026-04-23' AND '2026-04-29'
  GROUP BY store_cd
  ORDER BY precip_next7 DESC
  LIMIT 500

=== KPI CANONICAL DEFINITIONS AND LABELS (mandatory) ===

Every KPI value you present MUST carry its definition qualifier in the label.
Without this, later turns pick up ambiguous values and propagate wrong numbers.

Canonical labels (use these verbatim — do NOT shorten):
  - "Transaction Count (excl. returns & fees): 197"   NOT "Transactions: 204"
  - "Net Sales (GL): $1.2M"                           NOT just "Sales: $1.2M"
  - "Net Merchandise Sales: $900K"                    NOT just "Sales"
  - "Gross Margin % (merch-sales denominator): 41.2%"
  - "UPT (sale-type only): 2.4"                       (stricter than txn count)
  - "Average Ticket: $38.74"                          (excludes returns & fees)
  - "Avg Inventory (R12): $4.1M"
  - "GMROI (R12): 3.26"
  - "Inventory Turn (R12): 2.1"
  - "SPPH (weekly grain): $245/hr"

Approved formulas (use these exact shapes; never invent):
  - Net Sales (GL)           = SUM(net_sale_gl_amt)
  - Gross Merchandise Profit = SUM(gross_merchandise_profit_amt)
  - Gross Margin %           = SUM(gross_merchandise_profit_amt)
                               / NULLIF(SUM(net_merchandise_sale_amt), 0) * 100
  - Average Ticket           = SUM(net_sale_gl_amt)
                               / COUNT(DISTINCT transaction_id
                                       WHERE transaction_type_cd NOT IN ('return','fee-expense'))
  - UPT (Units Per Txn)      = SUM(upt_sale_qty WHERE transaction_type_cd = 'sale')
                               / COUNT(DISTINCT transaction_id
                                       WHERE transaction_type_cd = 'sale')
                               [numerator filter is REQUIRED — Epicor-era rows pre-2025-11-23
                                populate upt_sale_qty on fee-sale/fee-expense and inflate the sum]
  - Transaction Count        = COUNT(DISTINCT transaction_id
                                     WHERE transaction_type_cd NOT IN ('return','fee-expense'))
  - SPPH                     = SUM(actual_sales_amt)
                               / NULLIF(SUM(actual_payroll_hrs), 0)    [weekly grain only]
  - GMROI (R12)              = Gross_Profit_R12 / Avg_Inventory_R12
  - Inventory Turn (R12)     = Net_COGS_R12 / Avg_Inventory_R12

Prefer the semantic-view metrics (total_net_sales_gl, transaction_count, average_sale,
upt_avg, gross_margin_pct, total_gross_profit) — those have the filters baked in.
Only reach for base-table formulas above when the semantic view can't express the question.


=== DATA QUALITY RULES (mandatory unless user explicitly overrides) ===

1. WEATHER — Always filter \`dw_source_nm = 'historical'\` for actuals; \`'forecast'\` for projections.
   Forecast rows look identical to actuals and WILL produce wrong numbers if unfiltered.

2. STORES — Filter \`active_flg = TRUE\` on DIM_STORE unless analyzing closures or historical
   comparisons that specifically need closed stores.

3. TRANSACTIONS — Exclude \`transaction_type_cd IN ('return','fee-expense')\` for sales
   transaction counts. For UPT specifically use \`transaction_type_cd = 'sale'\` only.

4. PAYROLL GRAIN — Weekly only (week_ending_dt_key). There is NO daily SPPH. If the user
   asks for daily SPPH, explain the grain limit and offer the containing trade week.

5. STORE TIER — \`store_tier_num\` is stored as TEXT (e.g. '6') despite the name. Filter
   with quoted strings: \`store_tier_num = '6'\`.

6. TRADE YEAR — Aubuchon's trade year does NOT align with calendar year. Trade year 2026
   started Dec 28, 2025. When presenting "YTD" results, state the trade-year start if
   there's any chance of ambiguity.


=== TRADE CALENDAR / YOY PATTERNS (mandatory) ===

Never use \`DATEADD('year', -1, ...)\` for YoY. It breaks day-of-week alignment and produces
wrong retail numbers. Use one of the two approved patterns:

PATTERN 1 — 364-DAY SELF-JOIN  (weekly/daily-grain YoY)
  LY date = TY date shifted back 364 days (exactly 52 weeks). Preserves Sun-Sat alignment.
  Applies to: NET_SALES_TY_VS_LY_BY_TRADE_WEEK, UPT_TY_VS_LY_BY_STORE_TRADE_MONTH,
  GROSS_MARGIN_TY_VS_LY_BY_DEPARTMENT_QUARTER

PATTERN 2 — TRADE_WEEK_OF_YEAR MATCHING  (YTD aggregate YoY)
  Filter each year by TRADE_YEAR. Match periods using
    MOD(transaction_trade_year_week_num, 100)    -- = week 1-52/53
  For the current partial week, cap LY to same day-of-week as today:
    WHERE (trade_week_of_year < current_week)
       OR (trade_week_of_year = current_week
           AND transaction_day_of_week_num <= current_day_of_week)
  Applies to: YTD_SALES_BY_STORE_TY_VS_LY, WEATHER_TY_VS_LY_BY_STORE

Safety:
  - TRADE_YEAR (4-digit) is safe to use with YEAR(CURRENT_DATE()) - 1.
  - TRADE_WEEK (YYYYWW composite) is NOT safe for cross-year comparison — always
    normalize via TRADE_WEEK_OF_YEAR for that purpose.


=== SCHEMA GOTCHAS (column-name truth) ===

The business-language descriptions don't match the actual column names. Use the right side.
  "daily high temp"   → TEMP_MAX             (NOT HIGH_TEMPERATURE_F)
  "daily low temp"    → TEMP_MIN
  "daily average temp"→ TEMP_AVG
  "precipitation"     → PRECIPITATION_IN
  "snowfall"          → SNOW_FALL_IN
  "snow depth"        → SNOW_DEPTH_IN
  "wind speed"        → WIND_SPEED_AVG
  "store tier"        → STORE_TIER_NUM        (TEXT — quote the value)
  "trade week"        → TRANSACTION_TRADE_YEAR_WEEK_NUM   (YYYYWW composite)
  "trade year"        → TRANSACTION_TRADE_YEAR_NUM        (4-digit)

Month key on FCT_INVENTORY_HISTORIC: \`month_key\` is YYYY*1000 + MM
(e.g. 2026*1000 + 4 = 2026004). Don't parse it as YYYYMM.


=== COMMON PITFALLS (do NOT do these) ===

1. Do NOT web-search for weather. FCT_STORE_WEATHER has daily data per store.
2. Do NOT guess column names. Cross-reference the schema gotchas list above.
3. Do NOT forget \`dw_source_nm = 'historical'\` on weather queries.
4. Do NOT use DATEADD('year', -1, ...) for YoY. Use Pattern 1 (-364 days) or Pattern 2.
5. Do NOT write KPI formulas from scratch. Use the semantic view's pre-defined metrics
   (total_net_sales_gl, transaction_count, average_sale, upt_avg, gross_margin_pct).
6. Do NOT ask for daily SPPH. Weekly grain only.
7. Do NOT forget \`active_flg = TRUE\` on DIM_STORE unless analyzing closures.
8. Do NOT conflate trade year with calendar year — trade-year 2026 began Dec 28, 2025.


=== INTERNAL-FIRST DOMAIN MAP ===

These domains are fully covered by the allow-listed tables/semantic view. Never reach
for web_search when one of these can answer:
  Weather (temp, precip, snow)    → FCT_STORE_WEATHER (base) OR semantic view
  Store location/tier/size/team   → DIM_STORE (base)
  Product hierarchy/departments   → semantic view (product.department_nm / class / subclass)
  Customer segmentation/loyalty   → semantic view (customer.customer_category)
  Sales, transactions, margin     → semantic view
  Current inventory               → semantic view (inventory_current)
  Plan / budget / target          → REF_SALE_PLAN_BY_DAY (base)
  Payroll actuals and targets     → RPT_PAYROLL_BUDGET_AND_ACTUALS (base)
  Trade calendar / fiscal periods → semantic view (transaction_date)

External sources are ONLY appropriate for competitor pricing, industry benchmarks,
macro indicators, regulatory context, or news that might explain anomalies — never
for anything above.

Rules:
- Single statement. No semicolons inside. No comments.
- Date literals: 'YYYY-MM-DD'.
- For "yesterday" or "latest data" without a specific date, use the fallback date
  the caller supplies in the user message as {{REPORT_DATE}}.
- For "last year" / "LY", shift the date back 364 days (trade-week alignment).
- If the user asks for a store code, use STORE_CD as string ('001', '024', etc).
- If the question can't be answered with the semantic view, respond with
  exactly: NOSQL: <brief reason>
- Otherwise respond with ONLY the SQL wrapped in a \`\`\`sql code block. No prose.

COMPARISON WINDOW DEFAULTS (very important):
- Do NOT default to "today vs same day last year" or "yesterday vs same day last year".
  Those windows are too noisy for decision-useful answers.
- When the user asks for trend/performance/"how are we doing", prefer one of these
  windows (pick the one that best matches the question):
    * Trailing 7 days vs prior trailing 7 days (smooths day-of-week/weather)
    * Trailing 4 weeks vs prior 4 weeks (trend signal)
    * Month-to-date vs same month-to-date LY
    * Quarter-to-date vs same QTD LY
    * Year-to-date vs same YTD LY
    * Rolling 13 weeks vs prior 13 weeks (season signal)
- If the user explicitly asks for a specific day, honor it — but when possible,
  include a second query (or CTE) for the trailing-7-day view so the answer
  is decision-useful.
- For LY alignment in these windows, shift the window by 364 days (trade-week aligned).
- When the question implies weather-sensitive departments (paint, lawn & garden,
  snow, heating/cooling, seasonal), weather data is available via
  FCT_STORE_WEATHER (historical + forecast) — note that in the NOSQL response if
  the semantic view alone can't answer.
`.trim();

async function claudeComplete({ system, messages, max_tokens }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY env var");

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: max_tokens || 1024,
      system,
      messages,
    }),
  });
  const body = await resp.text();
  if (!resp.ok) {
    throw new Error(`Anthropic API ${resp.status}: ${body.slice(0, 400)}`);
  }
  let data;
  try { data = JSON.parse(body); }
  catch { throw new Error("Anthropic returned non-JSON: " + body.slice(0, 200)); }
  const text = (data.content || [])
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n")
    .trim();
  return text;
}

async function generateSql({ question, store, date, history }) {
  const contextBits = [];
  contextBits.push(`Report date (use if user says "yesterday" or doesn't specify): ${date}`);
  if (store) contextBits.push(`Currently selected store: ${store}. Filter to this store unless the user asks for company-wide/all stores.`);
  else contextBits.push("No store selected — queries default to company-wide.");

  const priorTurns = (history || []).slice(-4).map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: String(m.content || ""),
  }));

  const messages = [
    ...priorTurns,
    {
      role: "user",
      content: `${contextBits.join("\n")}\n\nQuestion: ${question}\n\nWrite the SQL now.`,
    },
  ];

  const text = await claudeComplete({
    system: SCHEMA_CARD.replace("{{REPORT_DATE}}", date),
    messages,
    max_tokens: 900,
  });

  if (/^NOSQL\s*:/i.test(text)) {
    const reason = text.replace(/^NOSQL\s*:\s*/i, "").trim();
    return { nosql: true, reason, raw: text };
  }
  const sql = extractSql(text);
  return { nosql: false, sql, raw: text };
}

async function summarizeRows({ question, sql, shaped }) {
  const { columns, rows } = shaped;
  const preview = rows.slice(0, 40);
  const sys = ADVISOR_SYSTEM_PROMPT;
  const userContent =
    `Question: ${question}\n\n` +
    `SQL that ran:\n\`\`\`sql\n${sql}\n\`\`\`\n\n` +
    `Columns: ${columns.join(", ")}\n` +
    `Row count: ${rows.length}\n` +
    `First ${preview.length} rows (JSON):\n${JSON.stringify(preview, null, 2)}`;
  const text = await claudeComplete({
    system: sys,
    messages: [{ role: "user", content: userContent }],
    max_tokens: 1800,
  });
  return text;
}

// ---------- Handler ----------
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") {
    res.status(405).json({ status: "error", error: "POST only" });
    return;
  }

  const t0 = Date.now();

  // Body may arrive parsed or as string depending on Vercel runtime.
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const question = String(body.question || "").trim();
  const store = sanitizeStore(body.store);
  const date = sanitizeDate(body.date) || yesterdayET();
  const history = Array.isArray(body.history) ? body.history : [];

  if (!question) {
    res.status(400).json({ status: "error", error: "Missing 'question'" });
    return;
  }
  if (question.length > 1000) {
    res.status(400).json({ status: "error", error: "Question too long (max 1000 chars)" });
    return;
  }

  // Env sanity
  const missing = [];
  if (!process.env.ANTHROPIC_API_KEY) missing.push("ANTHROPIC_API_KEY");
  if (!process.env.SNOWFLAKE_ACCOUNT) missing.push("SNOWFLAKE_ACCOUNT");
  if (!process.env.SNOWFLAKE_USER) missing.push("SNOWFLAKE_USER");
  if (!process.env.SNOWFLAKE_WAREHOUSE) missing.push("SNOWFLAKE_WAREHOUSE");
  if (!process.env.SNOWFLAKE_PASSWORD && !process.env.SNOWFLAKE_PRIVATE_KEY) {
    missing.push("SNOWFLAKE_PASSWORD or SNOWFLAKE_PRIVATE_KEY");
  }
  if (missing.length) {
    res.status(500).json({ status: "error", error: "Missing env vars: " + missing.join(", ") });
    return;
  }

  let conn = null;
  try {
    // 1. Generate SQL
    const gen = await generateSql({ question, store, date, history });
    if (gen.nosql) {
      res.status(200).json({
        status: "ok",
        kind: "nosql",
        answer: gen.reason || "I can't answer that from the retail analytics data.",
        sql: null,
        rows: [],
        columns: [],
        took_ms: Date.now() - t0,
      });
      return;
    }
    const sql = gen.sql;
    const validationErr = validateSql(sql);
    if (validationErr) {
      res.status(200).json({
        status: "ok",
        kind: "blocked",
        answer: `I generated a query that failed the safety check (${validationErr}). Try rephrasing the question.`,
        sql,
        rows: [],
        columns: [],
        took_ms: Date.now() - t0,
      });
      return;
    }

    // 2. Run the SQL
    conn = await Promise.race([
      connect(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Snowflake connect timeout (15s) — warehouse may be resuming from suspend")), 15000)),
    ]);
    const rawRows = await exec(conn, sql, "chat-query");
    const shaped = shapeRows(rawRows);

    // 3. Summarize
    let answer;
    try {
      answer = await summarizeRows({ question, sql, shaped });
    } catch (e) {
      // Fall back to a deterministic summary rather than failing the whole request.
      answer = `Ran the query and got ${shaped.rows.length} row(s). (Summarization skipped: ${String(e.message || e)})`;
    }

    res.status(200).json({
      status: "ok",
      kind: "answer",
      answer,
      sql,
      columns: shaped.columns,
      rows: shaped.rows.slice(0, 500),
      row_count: shaped.rows.length,
      took_ms: Date.now() - t0,
    });
  } catch (e) {
    res.status(500).json({
      status: "error",
      error: String(e && e.message ? e.message : e),
      took_ms: Date.now() - t0,
    });
  } finally {
    if (conn) await destroy(conn);
  }
}
