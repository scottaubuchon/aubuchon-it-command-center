// ============================================================
// /api/live-sales-snowflake
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
//
// Data sources:
//   PRD_EDW_DB.ANALYTICS_BASE.FCT_LIVE_SALE               (per-store/day rollup, updated ~every few min)
//   PRD_EDW_DB.ANALYTICS_BASE.FCT_LIVE_SALE_TRANSACTION_LINE (per line for top products)
//   PRD_EDW_DB.ANALYTICS_BASE.DIM_STORE                   (store name/city/state)
//   PRD_EDW_DB.ANALYTICS_BASE.RPT_PAYROLL_BUDGET_AND_ACTUALS (weekly target -> daily plan via /7)
// ============================================================

const snowflake = require("snowflake-sdk");

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
function connect() {
  return new Promise(function (resolve, reject) {
    var opts = {
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
    var conn = snowflake.createConnection(opts);
    conn.connect(function (err) {
      if (err) return reject(err);
      resolve(conn);
    });
  });
}

function exec(conn, sqlText) {
  return new Promise(function (resolve, reject) {
    conn.execute({
      sqlText: sqlText,
      complete: function (err, stmt, rows) {
        if (err) return reject(err);
        resolve(rows || []);
      },
    });
  });
}

function destroy(conn) {
  return new Promise(function (resolve) {
    try { conn.destroy(function () { resolve(); }); }
    catch (_) { resolve(); }
  });
}

// ---------- Formatting ----------
function toNumber(v) {
  if (v == null) return 0;
  var n = typeof v === "number" ? v : parseFloat(v);
  return isFinite(n) ? n : 0;
}

function fmtAsOfET(ts) {
  if (!ts) return "";
  var d = new Date(ts);
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
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  var conn = null;
  try {
    conn = await connect();
    var results = await Promise.all([
      exec(conn, COMPANY_SQL),
      exec(conn, STORES_SQL),
      exec(conn, PRODUCTS_SQL),
    ]);
    var companyRows = results[0];
    var storeRows   = results[1];
    var productRows = results[2];

    var c = companyRows[0] || {};
    var sales = toNumber(c.SALES);
    var plan  = toNumber(c.PLAN);
    var gp    = toNumber(c.GP);
    var gpPct = sales > 0 ? (gp / sales) * 100 : 0;
    var pctToPlan = plan > 0 ? (sales / plan) * 100 : 0;

    var payload = {
      status: "ok",
      companyTotal: {
        sales: sales,
        plan: plan,
        gp: gp,
        gpPct: gpPct,
        txns: toNumber(c.TXNS),
        customers: toNumber(c.CUSTOMERS),
        storeCount: toNumber(c.STORE_COUNT),
        pctToPlan: pctToPlan,
      },
      topStores: storeRows.map(function (r) {
        return {
          store: r.STORE,
          name:  r.NAME,
          city:  r.CITY,
          state: r.STATE,
          sales: toNumber(r.SALES),
          plan:  toNumber(r.PLAN),
          gp:    toNumber(r.GP),
          txns:  toNumber(r.TXNS),
        };
      }),
      topProducts: productRows.map(function (r) {
        return { product: r.PRODUCT, sales: toNumber(r.SALES) };
      }),
      asOfET: fmtAsOfET(c.AS_OF_TS) + " ET",
      cached: false,
      refreshedAt: new Date().toISOString(),
      source: "snowflake",
    };

    res.status(200).json(payload);
  } catch (err) {
    res.status(500).json({
      status: "error",
      error: (err && err.message) || String(err),
      source: "snowflake",
    });
  } finally {
    if (conn) await destroy(conn);
  }
};
