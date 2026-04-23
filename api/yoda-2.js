// ============================================================
// /api/yoda-2  (ESM — matches project's "type": "module")
// YODA 2.0 backend — queries the AUBUCHON_RETAIL_ANALYTICS
// semantic view + DIM_STORE + REF_SALE_PLAN_BY_DAY.
//
// Query params:
//   page   — "summary" | "products" | "customers"    (default: "summary")
//   store  — STORE_CD (optional; blank = company-wide)
//   date   — YYYY-MM-DD (optional; defaults to yesterday in ET)
//
// Payload shapes:
//   summary    → { kpis, weeklyTrend, stores, asOf }
//   products   → { products }      — top 20 departments today
//   customers  → { segments }      — customer_category TY vs LY
//
// Member Sales definition (per project memory 2026-04-23):
//   customer_category IN ('Rewards','Military','Employee','Stock Holder')
//
// Reuses the same Vercel Snowflake env vars as /api/live-sales-snowflake.
// ============================================================
process.env.HOME = "/tmp";
process.env.SF_OCSP_RESPONSE_CACHE_DIR = "/tmp";
process.env.SNOWFLAKE_LOG_LEVEL = "ERROR";

export const config = { maxDuration: 30 };

// ---------- Snowflake connection (lifted from live-sales-snowflake.js) ----------
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
  // Wrap Snowflake exec in a per-query timeout so we fail fast with a JSON
  // response instead of letting Vercel's platform-level 30s cap kill the
  // function (which returns a non-JSON HTML error page).
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
  (SELECT net_sales    FROM actuals)     AS net_sales,
  (SELECT txn_count    FROM actuals)     AS txn_count,
  (SELECT avg_ticket   FROM actuals)     AS avg_ticket,
  (SELECT upt          FROM actuals)     AS upt,
  (SELECT ly_net_sales  FROM ly_actuals) AS ly_net_sales,
  (SELECT ly_txn_count  FROM ly_actuals) AS ly_txn_count,
  (SELECT ly_avg_ticket FROM ly_actuals) AS ly_avg_ticket,
  (SELECT ly_upt        FROM ly_actuals) AS ly_upt,
  (SELECT member_sales    FROM member_ty) AS member_sales,
  (SELECT ly_member_sales FROM member_ly) AS ly_member_sales,
  (SELECT pro_sales    FROM pro_ty) AS pro_sales,
  (SELECT ly_pro_sales FROM pro_ly) AS ly_pro_sales
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
  // Fixed 2026-04-23: the Streamlit prototype used 'total_gross_merchandise_profit'
  // (a synonym, NL-only) and 'product.product_department_nm' (a column expression,
  // not the semantic dimension name). Canonical references from semantic model:
  //   TRANSACTION_LINE.TOTAL_GROSS_PROFIT  (qualify — also exists on PAYROLL_BUDGET_AND_ACTUALS)
  //   PRODUCT.DEPARTMENT_NM                (not PRODUCT_DEPARTMENT_NM)
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

// ---------- Row normalizers ----------
// Snowflake Node SDK returns column names in uppercase by default.
function k(row, name) {
  if (!row) return null;
  return row[name] ?? row[name.toLowerCase()] ?? row[name.toUpperCase()];
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

  const page = (req.query.page || "summary").toString();
  const store = sanitizeStore(req.query.store);
  const dt = sanitizeDate(req.query.date) || yesterdayET();
  const ly = shiftDays(dt, -364);  // Pattern 1 trade-week alignment (skill §8)

  let conn = null;
  try {
    // Bound the connect with a timeout too — on a cold/suspended warehouse this
    // can take a while, but hitting the Vercel 30s cap gives a non-JSON response.
    conn = await Promise.race([
      connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Snowflake connect timeout (15s) — warehouse may be resuming from suspend")), 15000)),
    ]);

    // Diagnostic: ?page=ping — minimal connectivity probe. Returns role, warehouse,
    // current time, and whether the semantic view is queryable. Fast, safe, and
    // tells us which of the typical failure modes is in play when the UI errors.
    if (page === "ping") {
      const [ctxRows, semRows] = await Promise.all([
        exec(conn, "SELECT CURRENT_ROLE() AS role, CURRENT_WAREHOUSE() AS wh, CURRENT_DATABASE() AS db, CURRENT_SCHEMA() AS sch, CURRENT_TIMESTAMP() AS ts", "ctx").catch(e => [{ _error: e.message }]),
        exec(conn,
          "SELECT * FROM SEMANTIC_VIEW(PRD_EDW_DB.SI_AGENTS.AUBUCHON_RETAIL_ANALYTICS " +
          "METRICS total_net_sales_gl AS net_sales " +
          "DIMENSIONS transaction_date.transaction_dt AS txn_dt " +
          `WHERE transaction_date.transaction_dt = '${dt}') LIMIT 1`, "semantic_probe").catch(e => [{ _error: e.message }]),
      ]);
      res.status(200).json({ status: "ok", page: "ping", dt, ctx: ctxRows[0], semantic: semRows[0] });
      return;
    }

    if (page === "summary") {
      // Switched from Promise.all to sequential to reduce warehouse concurrency
      // pressure during cold-start. The 6-CTE kpi-strip plus 3 other queries in
      // parallel were exhausting the 30s Vercel budget on warm-from-suspended
      // warehouses. Sequential is slightly slower when warm but much more
      // predictable — and every query has a 22s per-query guard.
      const kpiRows   = await exec(conn, sqlKpiStrip(store, dt, ly), "kpiStrip");
      const planRows  = await exec(conn, sqlPlan(store, dt),          "plan");
      const trendRows = await exec(conn, sqlWeeklyTrend(store, dt),   "weeklyTrend");
      const storeRows = await exec(conn, sqlStoreList(),              "storeList");
      const r = kpiRows[0] || {};
      const planRow = planRows[0] || {};
      const kpis = {
        netSales:      n(k(r, "NET_SALES")),
 