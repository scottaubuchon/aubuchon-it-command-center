// ============================================================
// /api/yoda-2  (ESM — matches project's "type": "module")
// YODA 2.0 backend — queries AUBUCHON_RETAIL_ANALYTICS semantic
// view + DIM_STORE + REF_SALE_PLAN_BY_DAY.
//
// Query params:
//   page   — "summary" | "products" | "customers" | "sku-drill" | "insights" | "ping"   (default: "summary")
//   store  — STORE_CD (optional; blank = company-wide)
//   date   — YYYY-MM-DD (optional; defaults to yesterday in ET)
//
// Payload shapes (status:"ok" on success):
//   summary    → { kpis, weeklyTrend, stores, asOf }
//   products   → { products }      // top 20 departments
//   customers  → { segments }      // customer_category TY vs LY
//   sku-drill  → { skus, window, grain, department, asOf }
//   insights   → { stores[], peers, dt, ly, asOf }  // each store: Top 5 actions
//   ping       → { dt, ctx, semantic }
//
// Member Sales = Rewards+Military+Employee+Stock Holder (per
// project memory 2026-04-23).
// ============================================================

// Snowflake SDK writes to HOME — route everything to /tmp (Vercel's only
// writable dir) BEFORE importing the SDK.
process.env.HOME = "/tmp";
process.env.SF_OCSP_RESPONSE_CACHE_DIR = "/tmp";
process.env.SNOWFLAKE_LOG_LEVEL = "ERROR";

export const config = { maxDuration: 30 };

// ---------- Snowflake connection ----------
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
  // Per-query timeout so we fail fast with a JSON response instead of
  // letting the platform-level 30s cap kill the function with HTML.
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
function sanitizeStore(s) {
  if (!s) return "";
  const clean = String(s).trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return clean.slice(0, 10);
}

function sanitizeDate(s) {
  if (!s) return "";
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

function yesterdayET() {
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  et.setDate(et.getDate() - 1);
  return et.toISOString().slice(0, 10);
}

function shiftDays(iso, delta) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

function n(x) {
  if (x === null || x === undefined || x === "") return 0;
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
}

// Snowflake Node SDK returns DATE columns as JS Date objects. String(date) gives
// "Sun Mar 29 2026 ..." which .slice(0,10) clips to "Sun Mar 29" — not ISO. Force
// ISO-8601 YYYY-MM-DD regardless of whether we got a Date, ISO string, or other.
function toIsoDate(v) {
  if (!v) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v);
  // Already ISO?
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // Try parsing it
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return s.slice(0, 10);
}

// Row lookup — Snowflake Node SDK returns uppercase keys, but defend both ways.
function k(row, name) {
  if (!row) return null;
  if (row[name] !== undefined) return row[name];
  if (row[name.toUpperCase()] !== undefined) return row[name.toUpperCase()];
  if (row[name.toLowerCase()] !== undefined) return row[name.toLowerCase()];
  return null;
}

// ---------- SQL builders ----------
// Member Sales uses 4-category IN filter per project memory 2026-04-23.
const MEMBER_FILTER = "customer.customer_category IN ('Rewards','Military','Employee','Stock Holder')";
const PRO_FILTER = "customer.customer_category = 'Professional'";

function sqlKpiStrip(storeFilter, dt, ly) {
  const storeClause = storeFilter ? `AND transaction_line.store_cd = '${storeFilter}'` : "";
  return `
WITH actuals AS (
  SELECT * FROM SEMANTIC_VIEW(
    PRD_EDW_DB.SI_AGENTS.AUBUCHON_RETAIL_ANALYTICS
    METRICS
      total_net_sales_gl AS net_sales,
      transaction_count AS txn_count,
      average_sale AS avg_ticket,
      upt_avg AS upt
    DIMENSIONS transaction_date.transaction_dt AS txn_dt
    WHERE transaction_date.transaction_dt = '${dt}' ${storeClause}
  )
),
ly_actuals AS (
  SELECT * FROM SEMANTIC_VIEW(
    PRD_EDW_DB.SI_AGENTS.AUBUCHON_RETAIL_ANALYTICS
    METRICS
      total_net_sales_gl AS ly_net_sales,
      transaction_count AS ly_txn_count,
      average_sale AS ly_avg_ticket,
      upt_avg AS ly_upt
    DIMENSIONS transaction_date.transaction_dt AS txn_dt
    WHERE transaction_date.transaction_dt = '${ly}' ${storeClause}
  )
),
member_ty AS (
  SELECT * FROM SEMANTIC_VIEW(
    PRD_EDW_DB.SI_AGENTS.AUBUCHON_RETAIL_ANALYTICS
    METRICS total_net_sales_gl AS member_sales
    DIMENSIONS transaction_date.transaction_dt AS txn_dt
    WHERE transaction_date.transaction_dt = '${dt}' ${storeClause} AND ${MEMBER_FILTER}
  )
),
member_ly AS (
  SELECT * FROM SEMANTIC_VIEW(
    PRD_EDW_DB.SI_AGENTS.AUBUCHON_RETAIL_ANALYTICS
    METRICS total_net_sales_gl AS ly_member_sales
    DIMENSIONS transaction_date.transaction_dt AS txn_dt
    WHERE transaction_date.transaction_dt = '${ly}' ${storeClause} AND ${MEMBER_FILTER}
  )
),
pro_ty AS (
  SELECT * FROM SEMANTIC_VIEW(
    PRD_EDW_DB.SI_AGENTS.AUBUCHON_RETAIL_ANALYTICS
    METRICS total_net_sales_gl AS pro_sales
    DIMENSIONS transaction_date.transaction_dt AS txn_dt
    WHERE transaction_date.transaction_dt = '${dt}' ${storeClause} AND ${PRO_FILTER}
  )
),
pro_ly AS (
  SELECT * FROM SEMANTIC_VIEW(
    PRD_EDW_DB.SI_AGENTS.AUBUCHON_RETAIL_ANALYTICS
    METRICS total_net_sales_gl AS ly_pro_sales
    DIMENSIONS transaction_date.transaction_dt AS txn_dt
    WHERE transaction_date.transaction_dt = '${ly}' ${storeClause} AND ${PRO_FILTER}
  )
)
SELECT
  (SELECT net_sales       FROM actuals)    AS net_sales,
  (SELECT txn_count       FROM actuals)    AS txn_count,
  (SELECT avg_ticket      FROM actuals)    AS avg_ticket,
  (SELECT upt             FROM actuals)    AS upt,
  (SELECT ly_net_sales    FROM ly_actuals) AS ly_net_sales,
  (SELECT ly_txn_count    FROM ly_actuals) AS ly_txn_count,
  (SELECT ly_avg_ticket   FROM ly_actuals) AS ly_avg_ticket,
  (SELECT ly_upt          FROM ly_actuals) AS ly_upt,
  (SELECT member_sales    FROM member_ty)  AS member_sales,
  (SELECT ly_member_sales FROM member_ly)  AS ly_member_sales,
  (SELECT pro_sales       FROM pro_ty)     AS pro_sales,
  (SELECT ly_pro_sales    FROM pro_ly)     AS ly_pro_sales
`;
}

function sqlPlan(storeFilter, dt) {
  const storeClause = storeFilter ? `AND store_cd = '${storeFilter}'` : "";
  return `SELECT COALESCE(SUM(daily_sales_plan_amt), 0) AS daily_plan
          FROM PRD_EDW_DB.ANALYTICS_BASE.REF_SALE_PLAN_BY_DAY
          WHERE plan_dt = '${dt}' ${storeClause}`;
}

function sqlWeeklyTrend(storeFilter, dt) {
  const storeClause = storeFilter ? `AND transaction_line.store_cd = '${storeFilter}'` : "";
  const start = shiftDays(dt, -55);
  return `
SELECT * FROM SEMANTIC_VIEW(
  PRD_EDW_DB.SI_AGENTS.AUBUCHON_RETAIL_ANALYTICS
  METRICS total_net_sales_gl AS net_sales
  DIMENSIONS transaction_date.transaction_dt AS txn_dt
  WHERE transaction_date.transaction_dt BETWEEN '${start}' AND '${dt}'
  ${storeClause}
)
ORDER BY txn_dt
`;
}

function sqlStoreList() {
  return `SELECT store_cd, store_nm, store_city_nm, store_state_cd
          FROM PRD_EDW_DB.ANALYTICS_BASE.DIM_STORE
          WHERE active_flg = TRUE
          ORDER BY store_cd`;
}

function sqlProducts(storeFilter, dt) {
  const storeClause = storeFilter ? `AND transaction_line.store_cd = '${storeFilter}'` : "";
  // Canonical refs: TRANSACTION_LINE.TOTAL_GROSS_PROFIT (qualified — name
  // is shared w/ PAYROLL facts), PRODUCT.DEPARTMENT_NM (not PRODUCT_DEPARTMENT_NM).
  return `
SELECT * FROM SEMANTIC_VIEW(
  PRD_EDW_DB.SI_AGENTS.AUBUCHON_RETAIL_ANALYTICS
  METRICS
    transaction_line.total_net_sales_gl AS net_sales,
    transaction_line.total_gross_profit AS gross_profit
  DIMENSIONS product.department_nm AS department
  WHERE transaction_date.transaction_dt = '${dt}' ${storeClause}
)
ORDER BY net_sales DESC NULLS LAST
LIMIT 20
`;
}

function sqlCustomers(storeFilter, dt, ly) {
  const storeClause = storeFilter ? `AND transaction_line.store_cd = '${storeFilter}'` : "";
  return `
WITH ty AS (
  SELECT * FROM SEMANTIC_VIEW(
    PRD_EDW_DB.SI_AGENTS.AUBUCHON_RETAIL_ANALYTICS
    METRICS
      total_net_sales_gl AS net_sales_ty,
      transaction_count AS txn_count_ty
    DIMENSIONS customer.customer_category AS customer_category
    WHERE transaction_date.transaction_dt = '${dt}' ${storeClause}
  )
),
ly AS (
  SELECT * FROM SEMANTIC_VIEW(
    PRD_EDW_DB.SI_AGENTS.AUBUCHON_RETAIL_ANALYTICS
    METRICS
      total_net_sales_gl AS net_sales_ly,
      transaction_count AS txn_count_ly
    DIMENSIONS customer.customer_category AS customer_category
    WHERE transaction_date.transaction_dt = '${ly}' ${storeClause}
  )
)
SELECT
  COALESCE(ty.customer_category, ly.customer_category) AS customer_category,
  COALESCE(ty.net_sales_ty, 0)   AS net_sales_ty,
  COALESCE(ly.net_sales_ly, 0)   AS net_sales_ly,
  COALESCE(ty.txn_count_ty, 0)   AS txn_count_ty,
  COALESCE(ly.txn_count_ly, 0)   AS txn_count_ly
FROM ty FULL OUTER JOIN ly USING (customer_category)
ORDER BY net_sales_ty DESC NULLS LAST
`;
}


function sqlSkuList(storeFilter, dt, deptFilter, skuList) {
  // Per-SKU net sales, gross profit, units sold for the selected day.
  // deptFilter and skuList are mutually usable (paste-list overrides dept scoping).
  // Semantic view refs verified 2026-04-23: product.product_cd, product.product_desc,
  // product.department_nm, transaction_line.total_net_sales_gl / total_gross_profit / total_sale_qty.
  const parts = [`transaction_date.transaction_dt = '${dt}'`];
  if (storeFilter) parts.push(`transaction_line.store_cd = '${storeFilter}'`);
  if (skuList && skuList.length) {
    const quoted = skuList.map(s => `'${s}'`).join(",");
    parts.push(`product.product_cd IN (${quoted})`);
  } else if (deptFilter) {
    // Escape single quotes in dept name (e.g., "Men's Apparel" — unlikely here but safe)
    const safe = String(deptFilter).replace(/'/g, "''");
    parts.push(`product.department_nm = '${safe}'`);
  }
  const whereClause = parts.join(" AND ");
  return `
SELECT * FROM SEMANTIC_VIEW(
  PRD_EDW_DB.SI_AGENTS.AUBUCHON_RETAIL_ANALYTICS
  METRICS
    transaction_line.total_net_sales_gl AS net_sales,
    transaction_line.total_gross_profit AS gross_profit,
    transaction_line.total_sale_qty AS units_sold
  DIMENSIONS
    product.product_cd AS sku,
    product.product_desc AS description,
    product.department_nm AS department,
    product.class_nm AS class_nm
  WHERE ${whereClause}
)
ORDER BY net_sales DESC NULLS LAST
`;
}

function sqlSkuOnHand(storeFilter, skuList) {
  // Point-in-time on-hand qty per SKU. inventory_current is a snapshot — no date needed.
  // When storeFilter is blank, total_on_hand is summed across all active stores.
  if (!skuList || !skuList.length) return null;
  const quoted = skuList.map(s => `'${s}'`).join(",");
  const parts = [`product.product_cd IN (${quoted})`];
  if (storeFilter) parts.push(`inventory_current.store_cd = '${storeFilter}'`);
  return `
SELECT * FROM SEMANTIC_VIEW(
  PRD_EDW_DB.SI_AGENTS.AUBUCHON_RETAIL_ANALYTICS
  METRICS inventory_current.total_on_hand AS on_hand
  DIMENSIONS product.product_cd AS sku
  WHERE ${parts.join(" AND ")}
)
`;
}

function sqlSkuSparkline(storeFilter, dt, skuList, windowKey) {
  // Sparkline data per SKU. Grain scales with window:
  //   "4w"  -> daily, 28 points per SKU
  //   "8w"  -> weekly, ~8 points per SKU  (via transaction_date.week_start_dt)
  //   "12w" -> weekly, ~12 points per SKU
  if (!skuList || !skuList.length) return { sql: null, grain: "daily" };
  const quoted = skuList.map(s => `'${s}'`).join(",");
  const parts = [
    `product.product_cd IN (${quoted})`,
  ];
  if (storeFilter) parts.push(`transaction_line.store_cd = '${storeFilter}'`);

  let days, grainDim, grain;
  if (windowKey === "12w") { days = 84; grainDim = "transaction_date.week_start_dt"; grain = "weekly"; }
  else if (windowKey === "8w") { days = 56; grainDim = "transaction_date.week_start_dt"; grain = "weekly"; }
  else { days = 28; grainDim = "transaction_date.transaction_dt"; grain = "daily"; }

  const start = shiftDays(dt, -(days - 1));
  parts.push(`transaction_date.transaction_dt BETWEEN '${start}' AND '${dt}'`);
  const sql = `
SELECT * FROM SEMANTIC_VIEW(
  PRD_EDW_DB.SI_AGENTS.AUBUCHON_RETAIL_ANALYTICS
  METRICS transaction_line.total_net_sales_gl AS net_sales
  DIMENSIONS
    product.product_cd AS sku,
    ${grainDim} AS dt
  WHERE ${parts.join(" AND ")}
)
ORDER BY sku, dt
`;
  return { sql, grain };
}

// ============================================================
// INSIGHTS v2 - Executive retail-advisor engine
// Decision-useful comparison windows (trailing 7d, trailing 28d,
// MTD vs LY MTD) + payroll (weekly grain from
// RPT_PAYROLL_BUDGET_AND_ACTUALS) + weather (FCT_STORE_WEATHER,
// historical + forecast) + inventory productivity (semantic view
// inventory_current). Emits per-store Top 5 actions plus a
// company-wide executive summary.
// ============================================================

function startOfMonthISO(iso) {
  return iso.slice(0, 7) + "-01";
}

function sqlPerStoreKpisMultiWindow(dt, ly) {
  // Per-store KPIs across four decision-useful windows in one call:
  //   trailing 7 days TY / LY, trailing 28 days TY / LY, MTD TY / LY.
  // Single-day comparisons are deliberately excluded - they are too volatile
  // for a "what to do today" recommendation.
  const ty7Start  = shiftDays(dt, -6);
  const ly7Start  = shiftDays(ly, -6);
  const ty28Start = shiftDays(dt, -27);
  const ly28Start = shiftDays(ly, -27);
  const mtdStart  = startOfMonthISO(dt);
  const lyMtdStart = shiftDays(mtdStart, -364);
  const lyMtdEnd   = ly; // LY-aligned end date
  return `
WITH ty7 AS (
  SELECT * FROM SEMANTIC_VIEW(
    PRD_EDW_DB.SI_AGENTS.AUBUCHON_RETAIL_ANALYTICS
    METRICS
      total_net_sales_gl AS net_sales,
      transaction_count  AS txn_count,
      average_sale       AS atv,
      upt_avg            AS upt
    DIMENSIONS transaction_line.store_cd AS store_cd
    WHERE transaction_date.transaction_dt BETWEEN '${ty7Start}' AND '${dt}'
  )
),
ly7 AS (
  SELECT * FROM SEMANTIC_VIEW(
    PRD_EDW_DB.SI_AGENTS.AUBUCHON_RETAIL_ANALYTICS
    METRICS
      total_net_sales_gl AS ly_net_sales,
      transaction_count  AS ly_txn_count,
      average_sale       AS ly_atv,
      upt_avg            AS ly_upt
    DIMENSIONS transaction_line.store_cd AS store_cd
    WHERE transaction_date.transaction_dt BETWEEN '${ly7Start}' AND '${ly}'
  )
),
ty28 AS (
  SELECT * FROM SEMANTIC_VIEW(
    PRD_EDW_DB.SI_AGENTS.AUBUCHON_RETAIL_ANALYTICS
    METRICS
      total_net_sales_gl AS net_sales_28,
      transaction_count  AS txn_count_28,
      average_sale       AS atv_28,
      upt_avg            AS upt_28
    DIMENSIONS transaction_line.store_cd AS store_cd
    WHERE transaction_date.transaction_dt BETWEEN '${ty28Start}' AND '${dt}'
  )
),
ly28 AS (
  SELECT * FROM SEMANTIC_VIEW(
    PRD_EDW_DB.SI_AGENTS.AUBUCHON_RETAIL_ANALYTICS
    METRICS total_net_sales_gl AS ly_net_sales_28
    DIMENSIONS transaction_line.store_cd AS store_cd
    WHERE transaction_date.transaction_dt BETWEEN '${ly28Start}' AND '${ly}'
  )
),
mtd_ty AS (
  SELECT * FROM SEMANTIC_VIEW(
    PRD_EDW_DB.SI_AGENTS.AUBUCHON_RETAIL_ANALYTICS
    METRICS total_net_sales_gl AS mtd_net_sales
    DIMENSIONS transaction_line.store_cd AS store_cd
    WHERE transaction_date.transaction_dt BETWEEN '${mtdStart}' AND '${dt}'
  )
),
mtd_ly AS (
  SELECT * FROM SEMANTIC_VIEW(
    PRD_EDW_DB.SI_AGENTS.AUBUCHON_RETAIL_ANALYTICS
    METRICS total_net_sales_gl AS ly_mtd_net_sales
    DIMENSIONS transaction_line.store_cd AS store_cd
    WHERE transaction_date.transaction_dt BETWEEN '${lyMtdStart}' AND '${lyMtdEnd}'
  )
),
mem28 AS (
  SELECT * FROM SEMANTIC_VIEW(
    PRD_EDW_DB.SI_AGENTS.AUBUCHON_RETAIL_ANALYTICS
    METRICS total_net_sales_gl AS member_sales_28
    DIMENSIONS transaction_line.store_cd AS store_cd
    WHERE transaction_date.transaction_dt BETWEEN '${ty28Start}' AND '${dt}' AND ${MEMBER_FILTER}
  )
),
pro28 AS (
  SELECT * FROM SEMANTIC_VIEW(
    PRD_EDW_DB.SI_AGENTS.AUBUCHON_RETAIL_ANALYTICS
    METRICS total_net_sales_gl AS pro_sales_28
    DIMENSIONS transaction_line.store_cd AS store_cd
    WHERE transaction_date.transaction_dt BETWEEN '${ty28Start}' AND '${dt}' AND ${PRO_FILTER}
  )
),
stores AS (
  SELECT store_cd FROM ty7
  UNION SELECT store_cd FROM ly7
  UNION SELECT store_cd FROM ty28
  UNION SELECT store_cd FROM ly28
  UNION SELECT store_cd FROM mtd_ty
  UNION SELECT store_cd FROM mtd_ly
  UNION SELECT store_cd FROM mem28
  UNION SELECT store_cd FROM pro28
)
SELECT
  s.store_cd              AS store_cd,
  ty7.net_sales           AS net_sales,
  ty7.txn_count           AS txn_count,
  ty7.atv                 AS atv,
  ty7.upt                 AS upt,
  ly7.ly_net_sales        AS ly_net_sales,
  ly7.ly_txn_count        AS ly_txn_count,
  ly7.ly_atv              AS ly_atv,
  ly7.ly_upt              AS ly_upt,
  ty28.net_sales_28       AS net_sales_28,
  ty28.txn_count_28       AS txn_count_28,
  ty28.atv_28             AS atv_28,
  ty28.upt_28             AS upt_28,
  ly28.ly_net_sales_28    AS ly_net_sales_28,
  mtd_ty.mtd_net_sales    AS mtd_net_sales,
  mtd_ly.ly_mtd_net_sales AS ly_mtd_net_sales,
  mem28.member_sales_28   AS member_sales_28,
  pro28.pro_sales_28      AS pro_sales_28
FROM stores s
LEFT JOIN ty7    ON ty7.store_cd    = s.store_cd
LEFT JOIN ly7    ON ly7.store_cd    = s.store_cd
LEFT JOIN ty28   ON ty28.store_cd   = s.store_cd
LEFT JOIN ly28   ON ly28.store_cd   = s.store_cd
LEFT JOIN mtd_ty ON mtd_ty.store_cd = s.store_cd
LEFT JOIN mtd_ly ON mtd_ly.store_cd = s.store_cd
LEFT JOIN mem28  ON mem28.store_cd  = s.store_cd
LEFT JOIN pro28  ON pro28.store_cd  = s.store_cd
`;
}

function sqlPerStorePlanMTD(dt) {
  const mtdStart = startOfMonthISO(dt);
  return `SELECT
            store_cd,
            COALESCE(SUM(CASE WHEN plan_dt BETWEEN '${mtdStart}' AND '${dt}' THEN daily_sales_plan_amt END), 0) AS mtd_plan,
            COALESCE(SUM(CASE WHEN plan_dt = '${dt}' THEN daily_sales_plan_amt END), 0) AS daily_plan
          FROM PRD_EDW_DB.ANALYTICS_BASE.REF_SALE_PLAN_BY_DAY
          WHERE plan_dt BETWEEN '${mtdStart}' AND '${dt}'
          GROUP BY store_cd`;
}

function sqlPerStoreRecencyTrend(dt) {
  // 28-day recent vs 28-day prior (rolling trend signal).
  const end = dt;
  const start = shiftDays(dt, -55);
  const splitDate = shiftDays(dt, -27);
  return `
WITH r AS (
  SELECT * FROM SEMANTIC_VIEW(
    PRD_EDW_DB.SI_AGENTS.AUBUCHON_RETAIL_ANALYTICS
    METRICS total_net_sales_gl AS net_sales
    DIMENSIONS
      transaction_line.store_cd AS store_cd,
      transaction_date.transaction_dt AS txn_dt
    WHERE transaction_date.transaction_dt BETWEEN '${start}' AND '${end}'
  )
)
SELECT
  store_cd,
  SUM(CASE WHEN txn_dt >= '${splitDate}' THEN net_sales ELSE 0 END) AS recent_28,
  SUM(CASE WHEN txn_dt <  '${splitDate}' THEN net_sales ELSE 0 END) AS prior_28
FROM r
GROUP BY store_cd
`;
}

function sqlPerStoreDeptMix28d(dt) {
  // Trailing 28 days dept mix by store. Smoother than single-day mix.
  const start = shiftDays(dt, -27);
  return `
SELECT * FROM SEMANTIC_VIEW(
  PRD_EDW_DB.SI_AGENTS.AUBUCHON_RETAIL_ANALYTICS
  METRICS
    transaction_line.total_net_sales_gl AS net_sales,
    transaction_line.total_gross_profit AS gross_profit
  DIMENSIONS
    transaction_line.store_cd AS store_cd,
    product.department_nm AS department
  WHERE transaction_date.transaction_dt BETWEEN '${start}' AND '${dt}'
)
`;
}

function sqlPayrollLast4Weeks(dt) {
  // Payroll grain is weekly. Pull the 4 most recent complete weeks ending on
  // or before the report date. Tolerate column-name variations by selecting
  // with aliases the handler can read.
  const end = dt;
  const start = shiftDays(dt, -27);
  return `
SELECT
  store_cd,
  SUM(actual_payroll_hrs)                        AS actual_hrs_4w,
  SUM(actual_sales_amt)                          AS actual_sales_4w,
  SUM(COALESCE(target_payroll_hrs, budget_payroll_hrs, 0))  AS target_hrs_4w,
  SUM(COALESCE(target_sales_amt,   budget_sales_amt,   0))  AS target_sales_4w
FROM PRD_EDW_DB.ANALYTICS_BASE.RPT_PAYROLL_BUDGET_AND_ACTUALS
WHERE week_ending_dt_key BETWEEN '${start}' AND '${end}'
GROUP BY store_cd
`;
}

function sqlInventoryKpisByStore() {
  // Point-in-time inventory KPIs from the semantic view. No date filter - it's
  // a snapshot. Pair with trailing-28d sales to produce a weeks-of-supply proxy.
  return `
SELECT * FROM SEMANTIC_VIEW(
  PRD_EDW_DB.SI_AGENTS.AUBUCHON_RETAIL_ANALYTICS
  METRICS
    inventory_current.total_on_hand          AS inv_units,
    inventory_current.total_replacement_value AS inv_value
  DIMENSIONS inventory_current.store_cd AS store_cd
)
`;
}

function sqlWeatherWindow(dt) {
  // Last 7 days actual weather + next 7 days forecast per store.
  // Flags precipitation, snow, and temperature extremes that typically move
  // traffic in paint, lawn & garden, snow, and heating/cooling departments.
  const pastStart   = shiftDays(dt, -6);
  const futureEnd   = shiftDays(dt,  7);
  return `
SELECT
  store_cd,
  AVG(CASE WHEN dw_source_nm = 'historical' THEN temp_avg        END) AS temp_avg_last7,
  SUM(CASE WHEN dw_source_nm = 'historical' THEN precipitation_in END) AS precip_last7,
  SUM(CASE WHEN dw_source_nm = 'historical' THEN snow_fall_in    END) AS snow_last7,
  AVG(CASE WHEN dw_source_nm = 'forecast'   AND dt > '${dt}' THEN temp_avg        END) AS temp_avg_next7,
  SUM(CASE WHEN dw_source_nm = 'forecast'   AND dt > '${dt}' THEN precipitation_in END) AS precip_next7,
  SUM(CASE WHEN dw_source_nm = 'forecast'   AND dt > '${dt}' THEN snow_fall_in    END) AS snow_next7,
  MAX(CASE WHEN dw_source_nm = 'forecast'   AND dt > '${dt}' THEN temp_max        END) AS temp_max_next7,
  MIN(CASE WHEN dw_source_nm = 'forecast'   AND dt > '${dt}' THEN temp_min        END) AS temp_min_next7
FROM PRD_EDW_DB.ANALYTICS_BASE.FCT_STORE_WEATHER
WHERE dt BETWEEN '${pastStart}' AND '${futureEnd}'
GROUP BY store_cd
`;
}

// ---------- Rule engine v2 ----------
function median(nums) {
  const a = nums.filter(x => Number.isFinite(x) && x > 0).slice().sort((x, y) => x - y);
  if (!a.length) return 0;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function money(v) {
  const x = Math.round(Number(v) || 0);
  return "$" + x.toLocaleString("en-US");
}

function pct(v, digits) {
  return (Number(v) * 100).toFixed(digits == null ? 1 : digits) + "%";
}

function generateInsights(s, peers) {
  // s is the per-store object; peers carries company-wide medians.
  const actions = [];

  // --- pull TRAILING windows, not single-day snapshots ---
  const ns7   = Number(s.netSales)    || 0;   // trailing 7d TY
  const lns7  = Number(s.lyNetSales)  || 0;   // trailing 7d LY
  const ns28  = Number(s.netSales28)  || 0;   // trailing 28d TY
  const lns28 = Number(s.lyNetSales28)|| 0;   // trailing 28d LY
  const txn28 = Number(s.txnCount28)  || 0;
  const atv28 = Number(s.atv28)       || 0;
  const upt28 = Number(s.upt28)       || 0;
  const mem28 = Number(s.memberSales28)|| 0;
  const pro28 = Number(s.proSales28)  || 0;
  const mtd   = Number(s.mtdNetSales) || 0;
  const lyMtd = Number(s.lyMtdNetSales) || 0;
  const mtdPlan = Number(s.mtdPlan) || 0;
  const recent28 = Number(s.recent28) || 0;
  const prior28  = Number(s.prior28)  || 0;
  const memberPct = ns28 ? mem28 / ns28 : 0;
  const proPct    = ns28 ? pro28 / ns28 : 0;

  // --- Rule 1: Trailing-7-day YoY sales gap ---
  if (lns7 > 0 && ns7 > 0) {
    const yoyVar7 = (ns7 - lns7) / lns7;
    if (yoyVar7 < -0.05) {
      const gap7     = lns7 - ns7;
      const gapDaily = gap7 / 7;
      actions.push({
        category: "Sales",
        priority: yoyVar7 < -0.12 ? "Urgent" : "High",
        title: "Close the 7-day YoY gap",
        detail:
          "Trailing 7 days " + pct(yoyVar7) + " vs same 7 days LY (short " + money(gap7) +
          ", about " + money(gapDaily) + "/day). Identify biggest-drop departments week-to-date and run a spotlight feature through close.",
        metric: "TY 7d " + money(ns7) + "  |  LY 7d " + money(lns7),
        impact: gapDaily,
      });
    }
  }

  // --- Rule 2: Trailing-28-day YoY sales gap (structural, not a blip) ---
  if (lns28 > 0 && ns28 > 0) {
    const yoyVar28 = (ns28 - lns28) / lns28;
    if (yoyVar28 < -0.03) {
      const gap28    = lns28 - ns28;
      const gapDaily = gap28 / 28;
      actions.push({
        category: "Sales",
        priority: yoyVar28 < -0.08 ? "High" : "Medium",
        title: "Structural 28-day YoY gap",
        detail:
          "Rolling 28d " + pct(yoyVar28) + " vs same 28d LY (cumulative " + money(gap28) + ", about " + money(gapDaily) +
          "/day drag). This is a trend signal - diagnose whether it's traffic, conversion, ticket, or mix.",
        metric: "TY 28d " + money(ns28) + "  |  LY 28d " + money(lns28),
        impact: gapDaily,
      });
    }
  }

  // --- Rule 3: MTD pace vs LY MTD ---
  if (lyMtd > 0 && mtd > 0) {
    const mtdVar = (mtd - lyMtd) / lyMtd;
    if (mtdVar < -0.03) {
      const gap = lyMtd - mtd;
      actions.push({
        category: "Sales",
        priority: mtdVar < -0.08 ? "High" : "Medium",
        title: "MTD pacing behind LY",
        detail:
          "Month-to-date " + pct(mtdVar) + " vs same period LY (" + money(gap) + " short). Rebuild the month with 2 strong weekend drivers and end-cap refresh.",
        metric: "MTD " + money(mtd) + "  |  LY MTD " + money(lyMtd),
        impact: gap / 7, // per-day rebuild pace
      });
    }
  }

  // --- Rule 4: ATV (28-day) below peers - coaching, not a one-day blip ---
  if (peers.atv28Median && atv28 > 0 && atv28 < peers.atv28Median * 0.95) {
    const gapPerTxn = peers.atv28Median - atv28;
    const dailyOpp  = gapPerTxn * (txn28 / 28) * 0.4;
    actions.push({
      category: "Sales",
      priority: gapPerTxn > 4 ? "High" : "Medium",
      title: "Coach add-ons to lift average ticket",
      detail:
        "Rolling 28d ATV of " + money(atv28) + " is " + money(gapPerTxn) + " below peer median (" + money(peers.atv28Median) +
        "). This is a persistent gap, not a daily blip. Run pre-shift attachment huddles; target +" + money(gapPerTxn / 2) + "/basket.",
      metric: "ATV 28d " + money(atv28) + "  |  Peer " + money(peers.atv28Median),
      impact: dailyOpp,
    });
  }

  // --- Rule 5: UPT (28-day) below peers ---
  if (peers.upt28Median && upt28 > 0 && upt28 < peers.upt28Median * 0.95) {
    const uptGap  = peers.upt28Median - upt28;
    const perUnit = upt28 ? (atv28 / upt28) : 0;
    const dailyOpp = perUnit * uptGap * (txn28 / 28) * 0.4;
    actions.push({
      category: "Sales",
      priority: "High",
      title: "Basket-build with suggestive selling",
      detail:
        "28d UPT of " + upt28.toFixed(2) + " is " + uptGap.toFixed(2) + " units below peer " + peers.upt28Median.toFixed(2) +
        ". Daily 'one more item' goal per cashier; each +0.1 UPT is about " + money(perUnit * 0.1 * (txn28 / 28)) + "/day on current traffic.",
      metric: "UPT 28d " + upt28.toFixed(2) + "  |  Peer " + peers.upt28Median.toFixed(2),
      impact: dailyOpp,
    });
  }

  // --- Rule 6: Member share (28-day) low - rewards capture ---
  if (peers.memberPctMedian && memberPct < peers.memberPctMedian * 0.90 && ns28 > 0) {
    const gapP = peers.memberPctMedian - memberPct;
    const gapD = gapP * ns28;
    actions.push({
      category: "Ops",
      priority: gapP > 0.05 ? "High" : "Medium",
      title: "Scan every member - push rewards capture",
      detail:
        "Only " + pct(memberPct) + " of 28d sales are to members vs peer " + pct(peers.memberPctMedian) +
        ". Daily cashier target: scan or enroll on every transaction. Gap worth about " + money(gapD / 28) + "/day.",
      metric: "Member % " + pct(memberPct) + "  |  Peer " + pct(peers.memberPctMedian),
      impact: (gapD / 28) * 0.5,
    });
  }

  // --- Rule 7: Pro/B2B share (28-day) low ---
  if (peers.proPctMedian && proPct < peers.proPctMedian * 0.90 && ns28 > 0) {
    const gapP = peers.proPctMedian - proPct;
    const gapD = gapP * ns28;
    actions.push({
      category: "Sales",
      priority: gapP > 0.04 ? "High" : "Medium",
      title: "B2B outreach - call the dormant pros",
      detail:
        "Pro share " + pct(proPct) + " of 28d mix vs peer " + pct(peers.proPctMedian) +
        ". Pull top 10 pro accounts that haven't purchased in 21+ days and have the B2B lead call them this week.",
      metric: "Pro % " + pct(proPct) + "  |  Peer " + pct(peers.proPctMedian),
      impact: (gapD / 28) * 0.4,
    });
  }

  // --- Rule 8: MTD plan attainment ---
  if (mtdPlan > 0) {
    const planAttn = mtd / mtdPlan;
    if (planAttn < 0.95) {
      const gap = mtdPlan - mtd;
      actions.push({
        category: "Sales",
        priority: planAttn < 0.85 ? "Urgent" : "High",
        title: "MTD plan gap - " + pct(planAttn, 0) + " of plan",
        detail:
          money(gap) + " short of MTD plan. Rebuild the remainder of the month around high-margin end caps; brief crew on the dollar number at huddle.",
        metric: "MTD actual " + money(mtd) + "  |  Plan " + money(mtdPlan),
        impact: gap / 7,
      });
    }
  }

  // --- Rule 9: 4-week recency trend slowing ---
  if (prior28 > 0 && recent28 > 0) {
    const trendVar = (recent28 - prior28) / prior28;
    if (trendVar < -0.03) {
      const weeklyDrag = Math.abs(recent28 - prior28) / 4;
      actions.push({
        category: "Sales",
        priority: trendVar < -0.08 ? "High" : "Medium",
        title: "Reverse the slowing recency trend",
        detail:
          "Last 4 weeks " + pct(trendVar) + " vs prior 4 (~" + money(weeklyDrag) + "/week drag). Pick one underperforming department and run a week-long spotlight promo.",
        metric: "Recent 4w " + money(recent28) + "  |  Prior 4w " + money(prior28),
        impact: weeklyDrag / 7,
      });
    }
  }

  // --- Rule 10: Margin drag by department (28d) ---
  if (s.weakMarginDept) {
    const d = s.weakMarginDept;
    actions.push({
      category: "Ops",
      priority: "Medium",
      title: "Margin drag: " + d.department,
      detail:
        d.department + " ran " + pct(d.margin) + " GM over the last 28d vs peer median " + pct(d.peerMargin) +
        ". Walk the set: pricing, damaged/markdown cart, override activity in MDM.",
      metric: "GM " + pct(d.margin) + "  |  Peer " + pct(d.peerMargin) + "  |  Sales " + money(d.netSales),
      impact: ((d.peerMargin - d.margin) * d.netSales) / 28,
    });
  }

  // --- Rule 11: Under-indexed department vs peers (28d mix) ---
  if (s.weakMixDept) {
    const d = s.weakMixDept;
    actions.push({
      category: "Sales",
      priority: "Medium",
      title: "Under-indexed: " + d.department,
      detail:
        d.department + " is " + pct(d.ownShare) + " of 28d sales vs peer median " + pct(d.peerShare) +
        ". Check stock levels, end cap placement, signage - usually an execution miss shows here first.",
      metric: "Mix " + pct(d.ownShare) + "  |  Peer " + pct(d.peerShare) + "  |  Sales " + money(d.netSales),
      impact: ((d.peerShare - d.ownShare) * ns28) / 28,
    });
  }

  // --- Rule 12: Payroll actuals vs target over 4 weeks (from RPT_PAYROLL_BUDGET_AND_ACTUALS) ---
  if (s.payrollHrsActual4w && s.payrollHrsTarget4w && s.payrollHrsTarget4w > 0) {
    const pctOver = (s.payrollHrsActual4w - s.payrollHrsTarget4w) / s.payrollHrsTarget4w;
    const avgWage = 16; // conservative fallback if wage rate unavailable
    if (pctOver > 0.05) {
      const excessHrs = s.payrollHrsActual4w - s.payrollHrsTarget4w;
      actions.push({
        category: "Payroll",
        priority: pctOver > 0.10 ? "High" : "Medium",
        title: "Payroll hours " + pct(pctOver, 0) + " over target (4w)",
        detail:
          "Running " + Math.round(excessHrs) + " hours above 4-week target (" + pct(pctOver) + " over). " +
          "Trim the slowest-traffic 2-hour blocks next week; preserve peak daypart coverage.",
        metric: "Actual " + Math.round(s.payrollHrsActual4w) + "  |  Target " + Math.round(s.payrollHrsTarget4w) + " hrs",
        impact: (excessHrs * avgWage) / 28,
      });
    } else if (pctOver < -0.08 && s.trafficTrendPos) {
      // Understaffing flag when traffic is positive
      const shortHrs = Math.abs(s.payrollHrsActual4w - s.payrollHrsTarget4w);
      actions.push({
        category: "Payroll",
        priority: "Medium",
        title: "Likely understaffed - add targeted hours",
        detail:
          "Hours " + pct(pctOver) + " below target with traffic holding. Likely hurting conversion at peak. " +
          "Add " + Math.round(shortHrs / 4) + " hrs/week on the highest-traffic daypart.",
        metric: "Actual " + Math.round(s.payrollHrsActual4w) + "  |  Target " + Math.round(s.payrollHrsTarget4w),
        impact: ns28 * 0.005,
      });
    }
  }

  // --- Rule 13: SPPH below peers (weekly grain, avg 4w) ---
  if (s.spph4w && peers.spph4wMedian && s.spph4w < peers.spph4wMedian * 0.92) {
    const gap = peers.spph4wMedian - s.spph4w;
    actions.push({
      category: "Payroll",
      priority: "Medium",
      title: "SPPH below peer median",
      detail:
        "4-week Sales Per Payroll Hour of " + money(s.spph4w) + " vs peer median " + money(peers.spph4wMedian) +
        ". Shift hours toward selling daypart; reduce non-productive coverage.",
      metric: "SPPH " + money(s.spph4w) + "  |  Peer " + money(peers.spph4wMedian),
      impact: gap * (s.payrollHrsActual4w / 28) * 0.5,
    });
  }

  // --- Rule 14: Weeks of supply / inventory productivity ---
  if (s.invValue && ns28 > 0) {
    const weeklySales = ns28 / 4;
    const wosByValue = weeklySales > 0 ? s.invValue / weeklySales : null;
    if (wosByValue && wosByValue > 20) {
      actions.push({
        category: "Ops",
        priority: "Medium",
        title: "Inventory is heavy - " + wosByValue.toFixed(1) + " weeks of supply",
        detail:
          "On-hand value of " + money(s.invValue) + " against 28d sales run-rate implies ~" + wosByValue.toFixed(1) +
          " weeks of supply. Identify aged/discontinued SKUs; consider a targeted markdown and halt replenishment on slow movers.",
        metric: "Inv value " + money(s.invValue) + "  |  Sales/wk " + money(weeklySales),
        impact: (s.invValue * 0.01) / 28, // rough markdown-recovery proxy
      });
    }
  }

  // --- Rule 15: Weather-driven staffing (next 7 days forecast) ---
  if (s.weather) {
    const w = s.weather;
    // Heavy precipitation expected - traffic down, trim hours
    if ((w.precipNext7 || 0) > 1.5) {
      actions.push({
        category: "Payroll",
        priority: "Medium",
        title: "Weather: heavy precip forecast - trim hours",
        detail:
          "Next 7d forecast shows " + (w.precipNext7).toFixed(1) + " in of precipitation. Expect traffic softness mid-week; " +
          "cut 4-8 non-essential hours on the rainiest days; preserve paint/tool aisle coverage for the rebound.",
        metric: "Precip next 7d " + (w.precipNext7).toFixed(1) + " in  |  Last 7d " + (w.precipLast7 || 0).toFixed(1) + " in",
        impact: ns28 * 0.003,
      });
    }
    // Warm week coming - lawn & garden / outdoor demand lift
    if ((w.tempAvgNext7 || 0) >= 65 && (w.tempAvgLast7 || 0) < 60) {
      actions.push({
        category: "Sales",
        priority: "High",
        title: "Weather tailwind - staff & stock L&G for the warm-up",
        detail:
          "Forecast avg temp " + Math.round(w.tempAvgNext7) + "F next 7d vs " + Math.round(w.tempAvgLast7 || 0) +
          "F last 7d. Add coverage in lawn & garden dayparts; verify in-stock on fertilizer, mulch, seasonal.",
        metric: "Temp next 7d " + Math.round(w.tempAvgNext7) + "F  |  last 7d " + Math.round(w.tempAvgLast7 || 0) + "F",
        impact: ns28 * 0.01,
      });
    }
    // Snow forecast - snow category + staffing
    if ((w.snowNext7 || 0) > 2) {
      actions.push({
        category: "Ops",
        priority: "High",
        title: "Snow forecast - stock & staff for the storm",
        detail:
          "Next 7d forecast: " + (w.snowNext7).toFixed(1) + " in of snow. Verify ice melt/shovels/snow blowers in-stock and front-merchandised; " +
          "add coverage ahead of storm, trim day-after if roads close.",
        metric: "Snow next 7d " + (w.snowNext7).toFixed(1) + " in",
        impact: ns28 * 0.015,
      });
    }
  }

  // Dedup by title, sort by impact desc, cap at 5
  const seen = new Set();
  const deduped = actions.filter(a => { if (seen.has(a.title)) return false; seen.add(a.title); return true; });
  deduped.sort((a, b) => (Number(b.impact) || 0) - (Number(a.impact) || 0));
  return deduped.slice(0, 5);
}

// Roll up per-store insights into a company-level executive summary.
function buildExecutiveSummary(stores, peers, dt, ly) {
  const agg = {
    storeCount: stores.length,
    actionCount: 0,
    byCategory: { Sales: 0, Ops: 0, Payroll: 0 },
    byPriority: { Urgent: 0, High: 0, Medium: 0, Low: 0 },
    topTitles: new Map(),
    totalOppDaily: 0,
    ns7Sum: 0,
    lns7Sum: 0,
    ns28Sum: 0,
    lns28Sum: 0,
    mtdSum: 0,
    lyMtdSum: 0,
    recent28Sum: 0,
    prior28Sum: 0,
    storesBelowLy7: 0,
    storesBelowLy28: 0,
    storesUrgent: 0,
    weatherAlerts: 0,
    payrollOver: 0,
    payrollUnder: 0,
  };

  for (const s of stores) {
    agg.ns7Sum     += Number(s.netSales)     || 0;
    agg.lns7Sum    += Number(s.lyNetSales)   || 0;
    agg.ns28Sum    += Number(s.netSales28)   || 0;
    agg.lns28Sum   += Number(s.lyNetSales28) || 0;
    agg.mtdSum     += Number(s.mtdNetSales)  || 0;
    agg.lyMtdSum   += Number(s.lyMtdNetSales)|| 0;
    agg.recent28Sum+= Number(s.recent28)     || 0;
    agg.prior28Sum += Number(s.prior28)      || 0;

    if (Number(s.netSales) < Number(s.lyNetSales) && Number(s.lyNetSales) > 0) agg.storesBelowLy7 += 1;
    if (Number(s.netSales28) < Number(s.lyNetSales28) && Number(s.lyNetSales28) > 0) agg.storesBelowLy28 += 1;

    for (const a of (s.insights || [])) {
      agg.actionCount += 1;
      agg.totalOppDaily += Number(a.impact) || 0;
      if (agg.byCategory[a.category] != null) agg.byCategory[a.category] += 1;
      if (agg.byPriority[a.priority] != null) agg.byPriority[a.priority] += 1;
      if (a.priority === "Urgent") agg.storesUrgent += 1;
      if (/weather|snow|precip/i.test(a.title)) agg.weatherAlerts += 1;
      if (/Payroll hours.*over target/i.test(a.title)) agg.payrollOver += 1;
      if (/understaffed/i.test(a.title)) agg.payrollUnder += 1;
      agg.topTitles.set(a.title, (agg.topTitles.get(a.title) || 0) + 1);
    }
  }

  const yoy7  = agg.lns7Sum  > 0 ? (agg.ns7Sum  - agg.lns7Sum)  / agg.lns7Sum  : null;
  const yoy28 = agg.lns28Sum > 0 ? (agg.ns28Sum - agg.lns28Sum) / agg.lns28Sum : null;
  const mtdVar= agg.lyMtdSum > 0 ? (agg.mtdSum  - agg.lyMtdSum) / agg.lyMtdSum : null;
  const trend = agg.prior28Sum > 0 ? (agg.recent28Sum - agg.prior28Sum) / agg.prior28Sum : null;

  // Top recurring themes (issues hitting multiple stores are systemic, not one-offs)
  const topThemes = Array.from(agg.topTitles.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([title, count]) => ({ title, storeCount: count }));

  // Top 5 stores with biggest estimated opportunity
  const topOppStores = stores.slice(0, 5).map(s => ({
    code: s.code,
    name: s.name,
    city: s.city,
    state: s.state,
    topAction: (s.insights && s.insights[0]) ? s.insights[0].title : null,
    topImpact: (s.insights && s.insights[0]) ? s.insights[0].impact : 0,
  }));

  return {
    windows: {
      trailing7d:  { ty: agg.ns7Sum,  ly: agg.lns7Sum,   yoy: yoy7 },
      trailing28d: { ty: agg.ns28Sum, ly: agg.lns28Sum,  yoy: yoy28 },
      mtd:         { ty: agg.mtdSum,  ly: agg.lyMtdSum,  yoy: mtdVar },
      recencyTrend:{ recent: agg.recent28Sum, prior: agg.prior28Sum, var: trend },
    },
    counts: {
      stores: agg.storeCount,
      actions: agg.actionCount,
      urgent: agg.storesUrgent,
      byCategory: agg.byCategory,
      byPriority: agg.byPriority,
      storesBelowLy7: agg.storesBelowLy7,
      storesBelowLy28: agg.storesBelowLy28,
      weatherAlerts: agg.weatherAlerts,
      payrollOver: agg.payrollOver,
      payrollUnder: agg.payrollUnder,
    },
    totalOppDaily: agg.totalOppDaily,
    topThemes,
    topOppStores,
    peers,
    dt,
    ly,
  };
}

// ---------- Handler ----------

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  const missing = [];
  if (!process.env.SNOWFLAKE_ACCOUNT)   missing.push("SNOWFLAKE_ACCOUNT");
  if (!process.env.SNOWFLAKE_USER)      missing.push("SNOWFLAKE_USER");
  if (!process.env.SNOWFLAKE_WAREHOUSE) missing.push("SNOWFLAKE_WAREHOUSE");
  if (!process.env.SNOWFLAKE_PASSWORD && !process.env.SNOWFLAKE_PRIVATE_KEY) {
    missing.push("SNOWFLAKE_PASSWORD or SNOWFLAKE_PRIVATE_KEY");
  }
  if (missing.length) {
    res.status(500).json({ status: "error", error: "Missing env vars: " + missing.join(", ") });
    return;
  }

  const page = ((req.query && req.query.page) || "summary").toString();
  const store = sanitizeStore(req.query && req.query.store);
  const dt = sanitizeDate(req.query && req.query.date) || yesterdayET();
  const ly = shiftDays(dt, -364);  // Pattern 1 trade-week alignment

  let conn = null;
  try {
    // Bound the connect with a timeout — on a cold/suspended warehouse this
    // can take a while; hitting Vercel's 30s cap gives a non-JSON HTML response.
    conn = await Promise.race([
      connect(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Snowflake connect timeout (15s) — warehouse may be resuming from suspend")), 15000)),
    ]);

    // --- ping: minimal connectivity probe for diagnostics ---
    if (page === "ping") {
      const [ctxRows, semRows] = await Promise.all([
        exec(conn, "SELECT CURRENT_ROLE() AS role, CURRENT_WAREHOUSE() AS wh, CURRENT_DATABASE() AS db, CURRENT_SCHEMA() AS sch, CURRENT_TIMESTAMP() AS ts", "ctx")
          .catch(e => [{ _error: e.message }]),
        exec(conn,
          "SELECT * FROM SEMANTIC_VIEW(PRD_EDW_DB.SI_AGENTS.AUBUCHON_RETAIL_ANALYTICS " +
          "METRICS total_net_sales_gl AS net_sales " +
          "DIMENSIONS transaction_date.transaction_dt AS txn_dt " +
          `WHERE transaction_date.transaction_dt = '${dt}') LIMIT 1`, "semantic_probe")
          .catch(e => [{ _error: e.message }]),
      ]);
      res.status(200).json({ status: "ok", page: "ping", dt, ctx: ctxRows[0], semantic: semRows[0] });
      return;
    }

    // --- summary: Main Dashboard + Sales Drivers ---
    if (page === "summary") {
      // Sequential (not Promise.all) to keep warehouse concurrency sane during
      // cold-start. Every query also has its own 22s guard.
      const kpiRows   = await exec(conn, sqlKpiStrip(store, dt, ly), "kpiStrip");
      const planRows  = await exec(conn, sqlPlan(store, dt),          "plan");
      const trendRows = await exec(conn, sqlWeeklyTrend(store, dt),   "weeklyTrend");
      const storeRows = await exec(conn, sqlStoreList(),              "storeList");

      const r = kpiRows[0] || {};
      const planRow = planRows[0] || {};

      const kpis = {
        netSales:       n(k(r, "NET_SALES")),
        txnCount:       n(k(r, "TXN_COUNT")),
        avgTicket:      n(k(r, "AVG_TICKET")),
        upt:            n(k(r, "UPT")),
        lyNetSales:     n(k(r, "LY_NET_SALES")),
        lyTxnCount:     n(k(r, "LY_TXN_COUNT")),
        lyAvgTicket:    n(k(r, "LY_AVG_TICKET")),
        lyUpt:          n(k(r, "LY_UPT")),
        memberSales:    n(k(r, "MEMBER_SALES")),
        lyMemberSales:  n(k(r, "LY_MEMBER_SALES")),
        proSales:       n(k(r, "PRO_SALES")),
        lyProSales:     n(k(r, "LY_PRO_SALES")),
        dailyPlan:      n(k(planRow, "DAILY_PLAN")),
      };

      const weeklyTrend = (trendRows || []).map((row) => ({
        date:     toIsoDate(k(row, "TXN_DT")),
        netSales: n(k(row, "NET_SALES")),
      }));

      const stores = (storeRows || []).map((row) => ({
        code:  k(row, "STORE_CD") || "",
        name:  k(row, "STORE_NM") || "",
        city:  k(row, "STORE_CITY_NM") || "",
        state: k(row, "STORE_STATE_CD") || "",
      }));

      res.status(200).json({
        status: "ok",
        kpis,
        weeklyTrend,
        stores,
        asOf: new Date().toISOString(),
      });
      return;
    }

    // --- products: Product Drill (top 20 departments) ---
    if (page === "products") {
      const rows = await exec(conn, sqlProducts(store, dt), "products");
      const products = (rows || []).map((row) => {
        const netSales = n(k(row, "NET_SALES"));
        const grossProfit = n(k(row, "GROSS_PROFIT"));
        const grossMarginPct = netSales ? grossProfit / netSales : 0;
        return {
          department: k(row, "DEPARTMENT") || "(unknown)",
          netSales,
          grossProfit,
          grossMarginPct,
        };
      });
      res.status(200).json({ status: "ok", products });
      return;
    }

    // --- customers: Customer Drill (TY vs LY by segment) ---
    if (page === "customers") {
      const rows = await exec(conn, sqlCustomers(store, dt, ly), "customers");
      const segments = (rows || []).map((row) => {
        const netSalesTy = n(k(row, "NET_SALES_TY"));
        const netSalesLy = n(k(row, "NET_SALES_LY"));
        const txnCountTy = n(k(row, "TXN_COUNT_TY"));
        const txnCountLy = n(k(row, "TXN_COUNT_LY"));
        const salesVar = netSalesLy ? (netSalesTy - netSalesLy) / netSalesLy : null;
        const txnVar   = txnCountLy ? (txnCountTy - txnCountLy) / txnCountLy : null;
        return {
          category: k(row, "CUSTOMER_CATEGORY") || "(uncategorized)",
          netSalesTy, netSalesLy, txnCountTy, txnCountLy,
          salesVar, txnVar,
        };
      });
      res.status(200).json({ status: "ok", segments });
      return;
    }

    // --- sku-drill: Two-tier Product Drill — SKU-level within a department ---
    if (page === "sku-drill") {
      // Query-string parsing. The paste-SKU-list overrides the department filter.
      const deptRaw = (req.query && req.query.department) || "";
      const department = String(deptRaw).trim().slice(0, 100);
      const skusRaw = (req.query && req.query.skus) || "";
      const skuList = String(skusRaw)
        .split(/[,\s]+/)
        .map(s => s.trim().toUpperCase().replace(/[^A-Z0-9-]/g, ""))
        .filter(Boolean)
        .slice(0, 500);  // cap to avoid unbounded IN lists
      const windowKey = ((req.query && req.query.window) || "8w").toString();
      const validWindow = ["4w", "8w", "12w"].includes(windowKey) ? windowKey : "8w";

      // Guard: require at least one scope (department OR skuList) — otherwise this would
      // return every SKU sold company-wide on the day, which is too large.
      if (!department && !skuList.length) {
        res.status(400).json({ status: "error", error: "sku-drill requires either 'department' or 'skus' query param" });
        return;
      }

      // Step 1: pull the SKU list for the day with net sales / gross profit / units.
      const listRows = await exec(conn, sqlSkuList(store, dt, department, skuList), "skuList");
      if (!listRows || listRows.length === 0) {
        res.status(200).json({
          status: "ok",
          skus: [],
          window: validWindow,
          grain: validWindow === "4w" ? "daily" : "weekly",
          department: department || null,
          asOf: new Date().toISOString(),
        });
        return;
      }
      const skuCodes = listRows.map(r => k(r, "SKU")).filter(Boolean);

      // Step 2 & 3: on-hand snapshot + sparkline — in parallel (same SKU set).
      const { sql: sparkSql, grain } = sqlSkuSparkline(store, dt, skuCodes, validWindow);
      const [onHandRows, sparkRows] = await Promise.all([
        exec(conn, sqlSkuOnHand(store, skuCodes), "skuOnHand").catch(e => {
          // On-hand is nice-to-have — don't kill the whole response if it fails.
          return [{ _error: e.message }];
        }),
        sparkSql
          ? exec(conn, sparkSql, "skuSparkline").catch(e => [{ _error: e.message }])
          : Promise.resolve([]),
      ]);

      const onHandBySku = new Map();
      for (const r of (onHandRows || [])) {
        const sku = k(r, "SKU");
        if (sku) onHandBySku.set(sku, n(k(r, "ON_HAND")));
      }

      const sparkBySku = new Map();
      for (const r of (sparkRows || [])) {
        const sku = k(r, "SKU");
        if (!sku) continue;
        if (!sparkBySku.has(sku)) sparkBySku.set(sku, []);
        sparkBySku.get(sku).push({
          date: toIsoDate(k(r, "DT")),
          netSales: n(k(r, "NET_SALES")),
        });
      }

      const skus = listRows.map(row => {
        const skuCd = k(row, "SKU") || "";
        const netSales = n(k(row, "NET_SALES"));
        const grossProfit = n(k(row, "GROSS_PROFIT"));
        const grossMarginPct = netSales ? grossProfit / netSales : 0;
        return {
          sku: skuCd,
          description: k(row, "DESCRIPTION") || "",
          department: k(row, "DEPARTMENT") || "",
          className:  k(row, "CLASS_NM") || "",
          netSales,
          grossProfit,
          grossMarginPct,
          unitsSold: n(k(row, "UNITS_SOLD")),
          onHand: onHandBySku.has(skuCd) ? onHandBySku.get(skuCd) : null,
          sparkline: sparkBySku.get(skuCd) || [],
        };
      });

      res.status(200).json({
        status: "ok",
        skus,
        window: validWindow,
        grain,
        department: department || null,
        asOf: new Date().toISOString(),
      });
      return;
    }

    // --- insights: Executive advisor - per-store Top 5 + company-wide summary ---
    if (page === "insights") {
      // Batch 1: core sales KPIs across multiple windows, plus store directory
      //          and MTD plan. These are the critical path - everything else
      //          degrades gracefully if unavailable.
      const [kpiRows, planRows, trendRows, storeRows] = await Promise.all([
        exec(conn, sqlPerStoreKpisMultiWindow(dt, ly), "insightsKpisMW"),
        exec(conn, sqlPerStorePlanMTD(dt),             "insightsPlanMTD").catch(e => [{ _error: e.message }]),
        exec(conn, sqlPerStoreRecencyTrend(dt),        "insightsTrend"  ).catch(e => [{ _error: e.message }]),
        exec(conn, sqlStoreList(),                     "insightsStores" ),
      ]);

      // Batch 2: enrichment signals. Each is optional - if the backing table
      // isn't available in this environment we degrade and annotate the
      // response so the frontend can render a clear gap message.
      const dataGaps = [];
      const [deptRows, payrollRows, invRows, weatherRows] = await Promise.all([
        exec(conn, sqlPerStoreDeptMix28d(dt),      "insightsDeptMix28d").catch(e => { dataGaps.push("dept_mix: " + e.message); return [{ _error: e.message }]; }),
        exec(conn, sqlPayrollLast4Weeks(dt),       "insightsPayroll4w" ).catch(e => { dataGaps.push("payroll: " + e.message); return [{ _error: e.message }]; }),
        exec(conn, sqlInventoryKpisByStore(),      "insightsInvKpi"    ).catch(e => { dataGaps.push("inventory: " + e.message); return [{ _error: e.message }]; }),
        exec(conn, sqlWeatherWindow(dt),           "insightsWeather"   ).catch(e => { dataGaps.push("weather: " + e.message); return [{ _error: e.message }]; }),
      ]);

      // ---- Index lookups ----
      const planByStore = new Map();
      for (const r of (planRows || [])) {
        if (r._error) continue;
        const code = k(r, "STORE_CD");
        if (code) planByStore.set(code, {
          mtdPlan:   n(k(r, "MTD_PLAN")),
          dailyPlan: n(k(r, "DAILY_PLAN")),
        });
      }
      const trendByStore = new Map();
      for (const r of (trendRows || [])) {
        if (r._error) continue;
        const code = k(r, "STORE_CD");
        if (code) trendByStore.set(code, { recent28: n(k(r, "RECENT_28")), prior28: n(k(r, "PRIOR_28")) });
      }
      const storeMeta = new Map();
      for (const r of (storeRows || [])) {
        const code = k(r, "STORE_CD");
        if (code) storeMeta.set(code, {
          name:  k(r, "STORE_NM") || "",
          city:  k(r, "STORE_CITY_NM") || "",
          state: k(r, "STORE_STATE_CD") || "",
        });
      }
      const payrollByStore = new Map();
      for (const r of (payrollRows || [])) {
        if (r._error) continue;
        const code = k(r, "STORE_CD");
        if (!code) continue;
        const actualHrs = n(k(r, "ACTUAL_HRS_4W"));
        const actualSales = n(k(r, "ACTUAL_SALES_4W"));
        const targetHrs = n(k(r, "TARGET_HRS_4W"));
        const spph = actualHrs > 0 ? actualSales / actualHrs : 0;
        payrollByStore.set(code, { actualHrs, actualSales, targetHrs, spph });
      }
      const invByStore = new Map();
      for (const r of (invRows || [])) {
        if (r._error) continue;
        const code = k(r, "STORE_CD");
        if (code) invByStore.set(code, {
          invUnits: n(k(r, "INV_UNITS")),
          invValue: n(k(r, "INV_VALUE")),
        });
      }
      const weatherByStore = new Map();
      for (const r of (weatherRows || [])) {
        if (r._error) continue;
        const code = k(r, "STORE_CD");
        if (code) weatherByStore.set(code, {
          tempAvgLast7: n(k(r, "TEMP_AVG_LAST7")),
          precipLast7:  n(k(r, "PRECIP_LAST7")),
          snowLast7:    n(k(r, "SNOW_LAST7")),
          tempAvgNext7: n(k(r, "TEMP_AVG_NEXT7")),
          precipNext7:  n(k(r, "PRECIP_NEXT7")),
          snowNext7:    n(k(r, "SNOW_NEXT7")),
          tempMaxNext7: n(k(r, "TEMP_MAX_NEXT7")),
          tempMinNext7: n(k(r, "TEMP_MIN_NEXT7")),
        });
      }

      // ---- Department mix peer medians (trailing 28d) ----
      const deptByStore       = new Map();
      const deptShareSamples  = new Map();
      const deptMarginSamples = new Map();
      for (const r of (deptRows || [])) {
        if (r && r._error) continue;
        const code = k(r, "STORE_CD");
        const dept = k(r, "DEPARTMENT");
        if (!code || !dept) continue;
        const net = n(k(r, "NET_SALES"));
        const gp  = n(k(r, "GROSS_PROFIT"));
        if (!deptByStore.has(code)) deptByStore.set(code, []);
        deptByStore.get(code).push({ department: dept, netSales: net, grossProfit: gp });
      }
      for (const rows of deptByStore.values()) {
        const total = rows.reduce((a, x) => a + x.netSales, 0);
        for (const x of rows) {
          const share  = total ? x.netSales / total : 0;
          const margin = x.netSales ? x.grossProfit / x.netSales : 0;
          if (!deptShareSamples.has(x.department))  deptShareSamples.set(x.department, []);
          if (!deptMarginSamples.has(x.department)) deptMarginSamples.set(x.department, []);
          deptShareSamples.get(x.department).push(share);
          deptMarginSamples.get(x.department).push(margin);
        }
      }
      const deptPeerShare  = new Map();
      const deptPeerMargin = new Map();
      for (const [d, arr] of deptShareSamples.entries())  deptPeerShare.set(d, median(arr));
      for (const [d, arr] of deptMarginSamples.entries()) deptPeerMargin.set(d, median(arr));

      // ---- Build per-store objects ----
      const storesOut = (kpiRows || []).map((row) => {
        const code  = k(row, "STORE_CD") || "";
        const t     = trendByStore.get(code) || { recent28: 0, prior28: 0 };
        const meta  = storeMeta.get(code) || {};
        const dRows = deptByStore.get(code) || [];
        const plan  = planByStore.get(code) || { mtdPlan: 0, dailyPlan: 0 };
        const pay   = payrollByStore.get(code) || null;
        const inv   = invByStore.get(code) || null;
        const wx    = weatherByStore.get(code) || null;

        // Weak-margin dept (28d): material sales + margin gap >= 4pts
        let weakMarginDept = null, weakMarginDrag = 0;
        for (const d of dRows) {
          if (d.netSales < 5000) continue;
          const margin = d.netSales ? d.grossProfit / d.netSales : 0;
          const peerMargin = deptPeerMargin.get(d.department) || 0;
          if (!peerMargin) continue;
          const drag = (peerMargin - margin) * d.netSales;
          if (drag > weakMarginDrag && (peerMargin - margin) > 0.04) {
            weakMarginDrag = drag;
            weakMarginDept = { department: d.department, margin, peerMargin, netSales: d.netSales };
          }
        }

        // Under-indexed dept (28d mix)
        let weakMixDept = null, weakMixDrag = 0;
        const storeTotal = dRows.reduce((a, x) => a + x.netSales, 0);
        if (storeTotal >= 10000) {
          for (const d of dRows) {
            const ownShare  = storeTotal ? d.netSales / storeTotal : 0;
            const peerShare = deptPeerShare.get(d.department) || 0;
            if (!peerShare || peerShare < 0.02) continue;
            if (ownShare > peerShare * 0.80) continue;
            const drag = (peerShare - ownShare) * storeTotal;
            if (drag > weakMixDrag) {
              weakMixDrag = drag;
              weakMixDept = { department: d.department, ownShare, peerShare, netSales: d.netSales };
            }
          }
        }

        const netSales7d  = n(k(row, "NET_SALES"));
        const lyNetSales7d= n(k(row, "LY_NET_SALES"));
        const trafficTrendPos = netSales7d > 0 && lyNetSales7d > 0 && (netSales7d - lyNetSales7d) / lyNetSales7d >= 0;

        return {
          code,
          name:  meta.name || "",
          city:  meta.city || "",
          state: meta.state || "",

          // Trailing 7d
          netSales:    netSales7d,
          lyNetSales:  lyNetSales7d,
          txnCount:    n(k(row, "TXN_COUNT")),
          atv:         n(k(row, "ATV")),
          upt:         n(k(row, "UPT")),
          lyTxnCount:  n(k(row, "LY_TXN_COUNT")),
          lyAtv:       n(k(row, "LY_ATV")),
          lyUpt:       n(k(row, "LY_UPT")),

          // Trailing 28d
          netSales28:   n(k(row, "NET_SALES_28")),
          lyNetSales28: n(k(row, "LY_NET_SALES_28")),
          txnCount28:   n(k(row, "TXN_COUNT_28")),
          atv28:        n(k(row, "ATV_28")),
          upt28:        n(k(row, "UPT_28")),
          memberSales28:n(k(row, "MEMBER_SALES_28")),
          proSales28:   n(k(row, "PRO_SALES_28")),

          // MTD
          mtdNetSales:   n(k(row, "MTD_NET_SALES")),
          lyMtdNetSales: n(k(row, "LY_MTD_NET_SALES")),

          // Plan
          mtdPlan:   plan.mtdPlan,
          dailyPlan: plan.dailyPlan,

          // Recency
          recent28: t.recent28,
          prior28:  t.prior28,

          // Payroll (weekly grain, summed across 4 weeks)
          payrollHrsActual4w: pay ? pay.actualHrs : null,
          payrollHrsTarget4w: pay ? pay.targetHrs : null,
          payrollSales4w:     pay ? pay.actualSales : null,
          spph4w:             pay ? pay.spph : null,

          // Inventory (point-in-time)
          invUnits: inv ? inv.invUnits : null,
          invValue: inv ? inv.invValue : null,

          // Weather (trailing 7d actual + next 7d forecast)
          weather: wx,

          // Derived flags
          trafficTrendPos,

          // Dept diagnostics
          weakMarginDept,
          weakMixDept,
        };
      }).filter(s => s.code);

      // ---- Peer benchmarks (medians) across stores with material sales ----
      const activeStores = storesOut.filter(s => s.netSales28 > 5000);
      const peers = {
        atv28Median:       median(activeStores.map(s => s.atv28)),
        upt28Median:       median(activeStores.map(s => s.upt28)),
        memberPctMedian:   median(activeStores.map(s => s.netSales28 ? s.memberSales28 / s.netSales28 : 0)),
        proPctMedian:      median(activeStores.map(s => s.netSales28 ? s.proSales28    / s.netSales28 : 0)),
        spph4wMedian:      median(activeStores.map(s => Number(s.spph4w) || 0)),
        netSales28Median:  median(activeStores.map(s => s.netSales28)),
      };

      // ---- Rule engine per store ----
      for (const s of storesOut) s.insights = generateInsights(s, peers);

      // ---- Sort by top-action impact (biggest opportunity first) ----
      storesOut.sort((a, b) => {
        const ai = (a.insights[0] && a.insights[0].impact) || 0;
        const bi = (b.insights[0] && b.insights[0].impact) || 0;
        return bi - ai;
      });

      // ---- Executive summary (company-wide) ----
      const exec = buildExecutiveSummary(storesOut, peers, dt, ly);

      res.status(200).json({
        status: "ok",
        page: "insights",
        dt, ly,
        peers,
        exec,
        stores: storesOut,
        dataGaps,
        asOf: new Date().toISOString(),
      });
      return;
    }

    res.status(400).json({ status: "error", error: "Unknown page: " + page });
  } catch (err) {
    res.status(500).json({
      status: "error",
      error: (err && err.message) || String(err),
      page,
      dt,
      store,
    });
  } finally {
    if (conn) await destroy(conn);
  }
}

