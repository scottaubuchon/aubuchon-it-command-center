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
// INSIGHTS - per-store Top 5 actionable recommendations
// Pivots the same AUBUCHON_RETAIL_ANALYTICS semantic view by
// store_cd and runs a rule-based analyst on top. Heuristics live
// in generateInsights() below.
// ============================================================

function sqlPerStoreKpis(dt, ly) {
  return `
WITH ty AS (
  SELECT * FROM SEMANTIC_VIEW(
    PRD_EDW_DB.SI_AGENTS.AUBUCHON_RETAIL_ANALYTICS
    METRICS
      total_net_sales_gl AS net_sales,
      transaction_count AS txn_count,
      average_sale AS avg_ticket,
      upt_avg AS upt
    DIMENSIONS transaction_line.store_cd AS store_cd
    WHERE transaction_date.transaction_dt = '${dt}'
  )
),
ly AS (
  SELECT * FROM SEMANTIC_VIEW(
    PRD_EDW_DB.SI_AGENTS.AUBUCHON_RETAIL_ANALYTICS
    METRICS
      total_net_sales_gl AS ly_net_sales,
      transaction_count AS ly_txn_count,
      average_sale AS ly_avg_ticket,
      upt_avg AS ly_upt
    DIMENSIONS transaction_line.store_cd AS store_cd
    WHERE transaction_date.transaction_dt = '${ly}'
  )
),
mem AS (
  SELECT * FROM SEMANTIC_VIEW(
    PRD_EDW_DB.SI_AGENTS.AUBUCHON_RETAIL_ANALYTICS
    METRICS total_net_sales_gl AS member_sales
    DIMENSIONS transaction_line.store_cd AS store_cd
    WHERE transaction_date.transaction_dt = '${dt}' AND ${MEMBER_FILTER}
  )
),
pro AS (
  SELECT * FROM SEMANTIC_VIEW(
    PRD_EDW_DB.SI_AGENTS.AUBUCHON_RETAIL_ANALYTICS
    METRICS total_net_sales_gl AS pro_sales
    DIMENSIONS transaction_line.store_cd AS store_cd
    WHERE transaction_date.transaction_dt = '${dt}' AND ${PRO_FILTER}
  )
),
stores AS (
  SELECT store_cd FROM ty
  UNION
  SELECT store_cd FROM ly
  UNION
  SELECT store_cd FROM mem
  UNION
  SELECT store_cd FROM pro
)
SELECT
  s.store_cd       AS store_cd,
  ty.net_sales     AS net_sales,
  ty.txn_count     AS txn_count,
  ty.avg_ticket    AS avg_ticket,
  ty.upt           AS upt,
  ly.ly_net_sales  AS ly_net_sales,
  ly.ly_txn_count  AS ly_txn_count,
  ly.ly_avg_ticket AS ly_avg_ticket,
  ly.ly_upt        AS ly_upt,
  mem.member_sales AS member_sales,
  pro.pro_sales    AS pro_sales
FROM stores s
LEFT JOIN ty  ON ty.store_cd  = s.store_cd
LEFT JOIN ly  ON ly.store_cd  = s.store_cd
LEFT JOIN mem ON mem.store_cd = s.store_cd
LEFT JOIN pro ON pro.store_cd = s.store_cd
`;
}

function sqlPerStorePlan(dt) {
  return `SELECT store_cd, COALESCE(SUM(daily_sales_plan_amt), 0) AS daily_plan
          FROM PRD_EDW_DB.ANALYTICS_BASE.REF_SALE_PLAN_BY_DAY
          WHERE plan_dt = '${dt}'
          GROUP BY store_cd`;
}

function sqlPerStoreRecencyTrend(dt) {
  // 4-weeks vs prior 4-weeks per store, bucketed in-SQL so we only ship one payload back.
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

function sqlPerStoreYoY7(dt, ly) {
  // Trailing 7-day TY vs trailing 7-day LY (trade-week aligned at -364 days).
  // Smooths single-day weather / day-of-week noise that made daily YoY too volatile.
  const tyStart = shiftDays(dt, -6);
  const lyStart = shiftDays(ly, -6);
  return `
WITH ty AS (
  SELECT * FROM SEMANTIC_VIEW(
    PRD_EDW_DB.SI_AGENTS.AUBUCHON_RETAIL_ANALYTICS
    METRICS total_net_sales_gl AS net_sales_7d
    DIMENSIONS transaction_line.store_cd AS store_cd
    WHERE transaction_date.transaction_dt BETWEEN '${tyStart}' AND '${dt}'
  )
),
ly AS (
  SELECT * FROM SEMANTIC_VIEW(
    PRD_EDW_DB.SI_AGENTS.AUBUCHON_RETAIL_ANALYTICS
    METRICS total_net_sales_gl AS ly_net_sales_7d
    DIMENSIONS transaction_line.store_cd AS store_cd
    WHERE transaction_date.transaction_dt BETWEEN '${lyStart}' AND '${ly}'
  )
),
stores AS (
  SELECT store_cd FROM ty
  UNION
  SELECT store_cd FROM ly
)
SELECT
  s.store_cd         AS store_cd,
  ty.net_sales_7d    AS net_sales_7d,
  ly.ly_net_sales_7d AS ly_net_sales_7d
FROM stores s
LEFT JOIN ty ON ty.store_cd = s.store_cd
LEFT JOIN ly ON ly.store_cd = s.store_cd
`;
}

function sqlPerStoreDeptMix(dt) {
  return `
SELECT * FROM SEMANTIC_VIEW(
  PRD_EDW_DB.SI_AGENTS.AUBUCHON_RETAIL_ANALYTICS
  METRICS
    transaction_line.total_net_sales_gl AS net_sales,
    transaction_line.total_gross_profit AS gross_profit
  DIMENSIONS
    transaction_line.store_cd AS store_cd,
    product.department_nm AS department
  WHERE transaction_date.transaction_dt = '${dt}'
)
`;
}

// ---------- Insights rule engine ----------
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

function generateInsights(store, peers) {
  const actions = [];

  const netSales    = Number(store.netSales) || 0;
  const lyNetSales  = Number(store.lyNetSales) || 0;
  const txnCount    = Number(store.txnCount) || 0;
  const lyTxnCount  = Number(store.lyTxnCount) || 0;
  const atv         = Number(store.avgTicket) || 0;
  const upt         = Number(store.upt) || 0;
  const memberSales = Number(store.memberSales) || 0;
  const proSales    = Number(store.proSales) || 0;
  const dailyPlan   = Number(store.dailyPlan) || 0;
  const recent28    = Number(store.recent28) || 0;
  const prior28     = Number(store.prior28) || 0;
  const memberPct   = netSales ? memberSales / netSales : 0;
  const proPct      = netSales ? proSales    / netSales : 0;

  // Rule 1: Trailing-7-day YoY sales gap
  // Single-day YoY was too volatile with weather / day-of-week swings.
  // Rolling 7-day TY vs LY (trade-week aligned) smooths the noise without
  // losing recency for a "what to do today" recommendation.
  const netSales7d   = Number(store.netSales7d)   || 0;
  const lyNetSales7d = Number(store.lyNetSales7d) || 0;
  if (lyNetSales7d > 0 && netSales7d > 0) {
    const yoyVar7 = (netSales7d - lyNetSales7d) / lyNetSales7d;
    if (yoyVar7 < -0.05) {
      const gap7     = lyNetSales7d - netSales7d;
      const gapDaily = gap7 / 7;
      actions.push({
        category: "Sales",
        priority: yoyVar7 < -0.12 ? "Urgent" : "High",
        title: "Close the 7-day YoY gap",
        detail:
          "Last 7 days are " + pct(yoyVar7) + " vs same 7 days last year (short " + money(gap7) +
          " total, about " + money(gapDaily) + "/day). " +
          "Identify the biggest-drop departments week-to-date and run a spotlight feature through close.",
        metric: "TY 7d " + money(netSales7d) + "  |  LY 7d " + money(lyNetSales7d),
        impact: gapDaily,
      });
    }
  }

  // Rule 2: ATV below peers
  if (peers.atvMedian && atv > 0 && atv < peers.atvMedian * 0.95) {
    const gapPerTxn = peers.atvMedian - atv;
    const dailyOpp  = gapPerTxn * txnCount * 0.4;
    actions.push({
      category: "Sales",
      priority: gapPerTxn > 4 ? "High" : "Medium",
      title: "Coach add-ons to lift average ticket",
      detail:
        "ATV of " + money(atv) + " is " + money(gapPerTxn) + " below peer median (" + money(peers.atvMedian) + "). " +
        "Run a pre-shift huddle on 2 attachment items per department; target +" + money(gapPerTxn / 2) + "/basket.",
      metric: "ATV " + money(atv) + "  |  Peer median " + money(peers.atvMedian),
      impact: dailyOpp,
    });
  }

  // Rule 3: UPT below peers
  if (peers.uptMedian && upt > 0 && upt < peers.uptMedian * 0.95) {
    const uptGap  = peers.uptMedian - upt;
    const perUnit = upt ? (atv / upt) : 0;
    const dailyOpp = perUnit * uptGap * txnCount * 0.4;
    actions.push({
      category: "Sales",
      priority: "High",
      title: "Basket-build with suggestive selling",
      detail:
        "UPT of " + upt.toFixed(2) + " is " + uptGap.toFixed(2) + " units below peer median (" + peers.uptMedian.toFixed(2) + "). " +
        "Set a daily 'one more item' goal per cashier; each +0.1 UPT is about " + money(perUnit * 0.1 * txnCount) + " on today's traffic.",
      metric: "UPT " + upt.toFixed(2) + "  |  Peer median " + peers.uptMedian.toFixed(2),
      impact: dailyOpp,
    });
  }

  // Rule 4: Member share low (OPS)
  if (peers.memberPctMedian && memberPct < peers.memberPctMedian * 0.90 && netSales > 0) {
    const gapP = peers.memberPctMedian - memberPct;
    const gapD = gapP * netSales;
    actions.push({
      category: "Ops",
      priority: gapP > 0.05 ? "High" : "Medium",
      title: "Scan every member - push rewards capture",
      detail:
        "Only " + pct(memberPct) + " of sales are to members vs peer median " + pct(peers.memberPctMedian) + ". " +
        "Daily cashier target: scan or enroll on every transaction. Gap is about " + money(gapD) + "/day in captured member spend.",
      metric: "Member share " + pct(memberPct) + "  |  Peer median " + pct(peers.memberPctMedian),
      impact: gapD * 0.5,
    });
  }

  // Rule 5: B2B / Pro share low
  if (peers.proPctMedian && proPct < peers.proPctMedian * 0.90 && netSales > 0) {
    const gapP = peers.proPctMedian - proPct;
    const gapD = gapP * netSales;
    actions.push({
      category: "Sales",
      priority: gapP > 0.04 ? "High" : "Medium",
      title: "B2B outreach - call the dormant pros",
      detail:
        "Pro sales at " + pct(proPct) + " of mix vs peer " + pct(peers.proPctMedian) + ". " +
        "Pull your top 10 pro accounts that haven't purchased in 21+ days and have the B2B lead call them today.",
      metric: "Pro share " + pct(proPct) + "  |  Peer median " + pct(peers.proPctMedian),
      impact: gapD * 0.4,
    });
  }

  // Rule 6: Plan attainment gap
  if (dailyPlan > 0) {
    const planAttn = netSales / dailyPlan;
    if (planAttn < 0.95) {
      const gap = dailyPlan - netSales;
      actions.push({
        category: "Sales",
        priority: planAttn < 0.85 ? "Urgent" : "High",
        title: "Plan gap - " + pct(planAttn, 0) + " of plan",
        detail:
          money(gap) + " short of today's plan. Feature 2 high-margin end caps for the remaining day-part and " +
          "brief the crew on the dollar number; every basket matters.",
        metric: "Actual " + money(netSales) + "  |  Plan " + money(dailyPlan),
        impact: gap,
      });
    }
  }

  // Rule 7: 4-week recency trend slowing
  if (prior28 > 0 && recent28 > 0) {
    const trendVar = (recent28 - prior28) / prior28;
    if (trendVar < -0.03) {
      const weeklyDrag = Math.abs(recent28 - prior28) / 4;
      actions.push({
        category: "Sales",
        priority: trendVar < -0.08 ? "High" : "Medium",
        title: "Reverse the slowing recency trend",
        detail:
          "Last 4 weeks " + pct(trendVar) + " vs prior 4 (~" + money(weeklyDrag) + "/week drag). " +
          "Pick one underperforming department and run a week-long spotlight promo with signage + huddle mention.",
        metric: "Recent 4w " + money(recent28) + "  |  Prior 4w " + money(prior28),
        impact: weeklyDrag,
      });
    }
  }

  // Rule 8: Low-margin department drag
  if (store.weakMarginDept) {
    const d = store.weakMarginDept;
    actions.push({
      category: "Ops",
      priority: "Medium",
      title: "Margin drag: " + d.department,
      detail:
        d.department + " ran " + pct(d.margin) + " GM vs peer median " + pct(d.peerMargin) + " today. " +
        "Walk the set: confirm pricing, check damaged/markdown cart, pull MDM for override activity.",
      metric: "GM " + pct(d.margin) + "  |  Peer " + pct(d.peerMargin) + "  |  Sales " + money(d.netSales),
      impact: (d.peerMargin - d.margin) * d.netSales,
    });
  }

  // Rule 9: Under-indexed department vs peers
  if (store.weakMixDept) {
    const d = store.weakMixDept;
    actions.push({
      category: "Sales",
      priority: "Medium",
      title: "Under-indexed: " + d.department,
      detail:
        d.department + " is " + pct(d.ownShare) + " of your sales vs peer median " + pct(d.peerShare) + ". " +
        "Check stock levels, end cap placement, and pricing signage - a clear execution miss often shows up here first.",
      metric: "Mix " + pct(d.ownShare) + "  |  Peer " + pct(d.peerShare) + "  |  Sales " + money(d.netSales),
      impact: (d.peerShare - d.ownShare) * netSales,
    });
  }

  // Rule 10: Payroll proxy - $/txn well below peers signals coverage/coaching mismatch
  if (peers.salesPerTxnMedian && txnCount > 0 && atv > 0 && atv < peers.salesPerTxnMedian * 0.92) {
    const gap = peers.salesPerTxnMedian - atv;
    actions.push({
      category: "Payroll",
      priority: "Medium",
      title: "Review coverage vs coaching mix",
      detail:
        "Sales per transaction of " + money(atv) + " is " + money(gap) + " below peer " + money(peers.salesPerTxnMedian) + " - " +
        "even after traffic. Walk the floor at peak today; the miss is usually coverage on the selling floor, not the register.",
      metric: "$/Txn " + money(atv) + "  |  Peer " + money(peers.salesPerTxnMedian),
      impact: gap * txnCount * 0.3,
    });
  }

  // Rule 11: Traffic down but ticket flat - right-size hours to traffic
  if (lyTxnCount > 0 && txnCount > 0) {
    const txnVar = (txnCount - lyTxnCount) / lyTxnCount;
    if (txnVar < -0.08 && atv >= (peers.atvMedian || atv) * 0.98) {
      actions.push({
        category: "Payroll",
        priority: "Medium",
        title: "Right-size hours to traffic",
        detail:
          "Traffic " + pct(txnVar) + " vs LY but ATV is holding - likely an hours-vs-traffic mismatch. " +
          "Compare today's schedule to last-year hourly transaction curve; trim the slowest 2-hour block.",
        metric: "Txns " + txnCount.toLocaleString() + "  |  LY " + lyTxnCount.toLocaleString(),
        impact: Math.abs(txnVar) * netSales * 0.1,
      });
    }
  }

  // Dedup + rank
  const seen = new Set();
  const deduped = actions.filter(a => { if (seen.has(a.title)) return false; seen.add(a.title); return true; });
  deduped.sort((a, b) => (Number(b.impact) || 0) - (Number(a.impact) || 0));
  return deduped.slice(0, 5);
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

    // --- insights: Per-store Top 5 actionable recommendations ---
    if (page === "insights") {
      // Sequential to keep warehouse concurrency sane; each query has its own 22s guard.
      const kpiRows    = await exec(conn, sqlPerStoreKpis(dt, ly),      "insightsKpis");
      const yoy7Rows   = await exec(conn, sqlPerStoreYoY7(dt, ly),      "insightsYoY7");
      const planRows   = await exec(conn, sqlPerStorePlan(dt),          "insightsPlan");
      const trendRows  = await exec(conn, sqlPerStoreRecencyTrend(dt),  "insightsTrend");
      const deptRows   = await exec(conn, sqlPerStoreDeptMix(dt),       "insightsDeptMix")
        .catch(e => [{ _error: e.message }]);
      const storeRows  = await exec(conn, sqlStoreList(),               "insightsStores");

      // Index helpers
      const planByStore = new Map();
      for (const r of (planRows || [])) {
        const code = k(r, "STORE_CD");
        if (code) planByStore.set(code, n(k(r, "DAILY_PLAN")));
      }
      const yoy7ByStore = new Map();
      for (const r of (yoy7Rows || [])) {
        const code = k(r, "STORE_CD");
        if (code) yoy7ByStore.set(code, {
          netSales7d:   n(k(r, "NET_SALES_7D")),
          lyNetSales7d: n(k(r, "LY_NET_SALES_7D")),
        });
      }
      const trendByStore = new Map();
      for (const r of (trendRows || [])) {
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

      // Per-store dept rows + peer-median share & margin
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

      // Build per-store objects
      const storesOut = (kpiRows || []).map((row) => {
        const code  = k(row, "STORE_CD") || "";
        const t     = trendByStore.get(code) || { recent28: 0, prior28: 0 };
        const meta  = storeMeta.get(code) || {};
        const dRows = deptByStore.get(code) || [];

        // Weak-margin dept: material sales + margin gap >= 4pts, ranked by $ drag
        let weakMarginDept = null, weakMarginDrag = 0;
        for (const d of dRows) {
          if (d.netSales < 1000) continue;
          const margin = d.netSales ? d.grossProfit / d.netSales : 0;
          const peerMargin = deptPeerMargin.get(d.department) || 0;
          if (!peerMargin) continue;
          const drag = (peerMargin - margin) * d.netSales;
          if (drag > weakMarginDrag && (peerMargin - margin) > 0.04) {
            weakMarginDrag = drag;
            weakMarginDept = { department: d.department, margin, peerMargin, netSales: d.netSales };
          }
        }

        // Under-indexed dept vs peers, ranked by $ drag
        let weakMixDept = null, weakMixDrag = 0;
        const storeTotal = dRows.reduce((a, x) => a + x.netSales, 0);
        if (storeTotal >= 2000) {
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

        return {
          code,
          name:  meta.name  || "",
          city:  meta.city  || "",
          state: meta.state || "",
          netSales:    n(k(row, "NET_SALES")),
          txnCount:    n(k(row, "TXN_COUNT")),
          avgTicket:   n(k(row, "AVG_TICKET")),
          upt:         n(k(row, "UPT")),
          lyNetSales:  n(k(row, "LY_NET_SALES")),
          lyTxnCount:  n(k(row, "LY_TXN_COUNT")),
          lyAvgTicket: n(k(row, "LY_AVG_TICKET")),
          lyUpt:       n(k(row, "LY_UPT")),
          memberSales: n(k(row, "MEMBER_SALES")),
          proSales:    n(k(row, "PRO_SALES")),
          dailyPlan:   planByStore.get(code) || 0,
          recent28:    t.recent28,
          prior28:     t.prior28,
          netSales7d:   (yoy7ByStore.get(code) || {}).netSales7d   || 0,
          lyNetSales7d: (yoy7ByStore.get(code) || {}).lyNetSales7d || 0,
          weakMarginDept,
          weakMixDept,
        };
      }).filter(s => s.code);

      // Peer benchmarks from stores with non-trivial sales
      const activeStores = storesOut.filter(s => s.netSales > 500);
      const peers = {
        atvMedian:         median(activeStores.map(s => s.avgTicket)),
        uptMedian:         median(activeStores.map(s => s.upt)),
        memberPctMedian:   median(activeStores.map(s => s.netSales ? s.memberSales / s.netSales : 0)),
        proPctMedian:      median(activeStores.map(s => s.netSales ? s.proSales    / s.netSales : 0)),
        salesPerTxnMedian: median(activeStores.map(s => s.avgTicket)),
        netSalesMedian:    median(activeStores.map(s => s.netSales)),
      };

      // Run rule engine per store, sort by biggest opportunity first
      for (const s of storesOut) s.insights = generateInsights(s, peers);
      storesOut.sort((a, b) => {
        const ai = (a.insights[0] && a.insights[0].impact) || 0;
        const bi = (b.insights[0] && b.insights[0].impact) || 0;
        return bi - ai;
      });

      res.status(200).json({
        status: "ok",
        page: "insights",
        dt, ly,
        peers,
        stores: storesOut,
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

