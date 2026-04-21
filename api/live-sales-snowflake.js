// deploy-bump: 2026-04-21T17:30:27Z
// ============================================================
// /api/live-sales-snowflake  (ESM — matches project's "type": "module")
// Returns today's live sales snapshot sourced from Snowflake.
// Mirrors the payload shape of /api/live-sales so the React
// LiveSalesSnowflakeView can reuse the same renderer.
//
// Required Vercel env vars:
//   SNOWFLAKE_ACCOUNT       e.g. xy12345.us-east-1
//   SNOWFLAKE_USER
//   SNOWFLAKE_PASSWORD      (or SNOWFLAKE_PRIVATE_KEY / _PASSPHRASE)
//   SNOWFLAKE_WAREHOUSE
//   SNOWFLAKE_DATABASE      e.g. PRD_EDW_DB
//   SNOWFLAKE_SCHEMA        e.g. ANALYTICS_BASE
//   SNOWFLAKE_ROLE          (optional)
// ============================================================

// Route every writable path the SDK might touch into /tmp (Vercel's only
// writable dir). These must be set BEFORE snowflake-sdk is imported.
process.env.HOME = "/tmp";
process.env.SF_OCSP_RESPONSE_CACHE_DIR = "/tmp";
process.env.SNOWFLAKE_LOG_LEVEL = "ERROR";

export const config = { maxDuration: 30 };

// ---------- SQL ----------
const COMPANY_SQL = `
WITH today_sales AS (
  SELECT
    SUM(ls.NET_SALES)                          AS sales,
    SUM(ls.NET_SALES - ls.COST_OF_GOODS)       AS gp,
    SUM(ls.TRANSACTION_CNT)                    AS txns,
    SUM(ls.CUSTOMER_CNT)                       AS customers,
    COUNT(DISTINCT ls.STORE_CD)                AS store_count,
    MAX(ls.LAST_UPDATED_TS)                    AS as_of_ts
  FROM PRD_EDW_DB.ANALYTICS_BASE.FCT_LIVE_SALE ls
  WHERE ls.CURRENT_DT = CURRENT_DATE()
),
today_plan AS (
  SELECT SUM(pba.TARGET_SALES_AMT) / 7.0 AS daily_plan
  FROM PRD_EDW_DB.ANALYTICS_BASE.RPT_PAYROLL_BUDGET_AND_ACTUALS pba
  WHERE pba.WEEK_ENDING_DT >= DATE_TRUNC('week', CURRENT_DATE())
    AND pba.WEEK_ENDING_DT <  DATEADD('week', 1, DATE_TRUNC('week', CURRENT_DATE()))
)
SELECT
  COALESCE(ts.sales, 0)       AS sales,
  COALESCE(tp.daily_plan, 0)  AS plan,
  COALESCE(ts.gp, 0)          AS gp,
  COALESCE(ts.txns, 0)        AS txns,
  COALESCE(ts.customers, 0)   AS customers,
  COALESCE(ts.store_count, 0) AS store_count,
  ts.as_of_ts
FROM today_sales ts CROSS JOIN today_plan tp
`;

const STORES_SQL = `
WITH today AS (
  SELECT STORE_CD, NET_SALES, NET_SALES - COST_OF_GOODS AS GP, TRANSACTION_CNT
  FROM PRD_EDW_DB.ANALYTICS_BASE.FCT_LIVE_SALE
  WHERE CURRENT_DT = CURRENT_DATE()
),
store_plan AS (
  SELECT STORE_CD, TARGET_SALES_AMT / 7.0 AS daily_plan
  FROM PRD_EDW_DB.ANALYTICS_BASE.RPT_PAYROLL_BUDGET_AND_ACTUALS
  WHERE WEEK_ENDING_DT >= DATE_TRUNC('week', CURRENT_DATE())
    AND WEEK_ENDING_DT <  DATEADD('week', 1, DATE_TRUNC('week', CURRENT_DATE()))
)
SELECT
  t.STORE_CD               AS store,
  ds.STORE_NM              AS name,
  ds.STORE_CITY_NM         AS city,
  ds.STORE_STATE_CD        AS state,
  t.NET_SALES              AS sales,
  COALESCE(sp.daily_plan, 0) AS plan,
  t.GP                     AS gp,
  t.TRANSACTION_CNT        AS txns
FROM today t
LEFT JOIN PRD_EDW_DB.ANALYTICS_BASE.DIM_STORE ds
  ON ds.STORE_CD = t.STORE_CD AND ds.ACTIVE_FLG = TRUE
LEFT JOIN store_plan sp ON sp.STORE_CD = t.STORE_CD
ORDER BY t.NET_SALES DESC NULLS LAST
LIMIT 20
`;

const PRODUCTS_SQL = `
SELECT PRODUCT_DESC AS product, SUM(ITEM_EXTENDED_AMT) AS sales
FROM PRD_EDW_DB.ANALYTICS_BASE.FCT_LIVE_SALE_TRANSACTION_LINE
WHERE CREATED_DT = CURRENT_DATE()
  AND PRODUCT_DESC IS NOT NULL
GROUP BY PRODUCT_DESC
ORDER BY sales DESC NULLS LAST
LIMIT 20
`;

// ---------- Snowflake helpers ----------
let _snowflake = null;
async function getSdk() {
  if (_snowflake) return _snowflake;
  const mod = await import("snowflake-sdk");
  _snowflake = mod.default || mod;
  try {
    _snowflake.configure({
      logLevel: "ERROR",
      additionalLogToConsole: false,
    });
  } catch (_) { /* older versions may not accept these options */ }
  return _snowflake;
}

async function connect() {
  const sdk = await getSdk();
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
    const conn = sdk.createConnection(opts);
    conn.connect((err) => {
      if (err) return reject(err);
      resolve(conn);
    });
  });
}

function exec(conn, sqlText) {
  return new Promise((resolve, reject) => {
    conn.execute({
      sqlText,
      complete: (err, stmt, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      },
    });
  });
}

function destroy(conn) {
  return new Promise((resolve) => {
    try { conn.destroy(() => resolve()); }
    catch (_) { resolve(); }
  });
}

function toNumber(v) {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(v);
  return isFinite(n) ? n : 0;
}

function fmtAsOfET(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return String(ts);
  try {
    return d.toLocaleString("en-US", {
      timeZone: "America/New_York",
      month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit",
    });
  } catch (_) {
    return d.toISOString();
  }
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
    res.status(500).json({
      status: "error",
      error: "Missing required env vars: " + missing.join(", "),
      source: "snowflake",
    });
    return;
  }

  let conn = null;
  try {
    conn = await connect();
    const [companyRows, storeRows, productRows] = await Promise.all([
      exec(conn, COMPANY_SQL),
      exec(conn, STORES_SQL),
      exec(conn, PRODUCTS_SQL),
    ]);

    const c = companyRows[0] || {};
    const sales = toNumber(c.SALES);
    const plan  = toNumber(c.PLAN);
    const gp    = toNumber(c.GP);
    const gpPct = sales > 0 ? (gp / sales) * 100 : 0;
    const pctToPlan = plan > 0 ? (sales / plan) * 100 : 0;

    const payload = {
      status: "ok",
      companyTotal: {
        sales, plan, gp, gpPct,
        txns:       toNumber(c.TXNS),
        customers:  toNumber(c.CUSTOMERS),
        storeCount: toNumber(c.STORE_COUNT),
        pctToPlan,
      },
      topStores: storeRows.map((r) => ({
        store: r.STORE,
        name:  r.NAME,
        city:  r.CITY,
        state: r.STATE,
        sales: toNumber(r.SALES),
        plan:  toNumber(r.PLAN),
        gp:    toNumber(r.GP),
        txns:  toNumber(r.TXNS),
      })),
      topProducts: productRows.map((r) => ({
        product: r.PRODUCT,
        sales:   toNumber(r.SALES),
      })),
      asOfET: fmtAsOfET(c.AS_OF_TS) + " ET",
      cached: false,
      refreshedAt: new Date().toISOString(),
      source: "snowflake",
    };

    res.status(200).json(payload);
  } catch (err) {
    console.error("[live-sales-snowflake] error:", err);
    res.status(500).json({
      status: "error",
      error: (err && err.message) || String(err),
      code:  (err && err.code)    || null,
      source: "snowflake",
    });
  } finally {
    if (conn) await destroy(conn);
  }
}
