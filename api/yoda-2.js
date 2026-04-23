// ============================================================
// /api/yoda-2  (ESM — matches project's "type": "module")
// YODA 2.0 backend — queries AUBUCHON_RETAIL_ANALYTICS semantic
// view + DIM_STORE + REF_SALE_PLAN_BY_DAY.
//
// Query params:
//   page   — "summary" | "products" | "customers" | "ping"   (default: "summary")
//   store  — STORE_CD (optional; blank = company-wide)
//   date   — YYYY-MM-DD (optional; defaults to yesterday in ET)
//
// Payload shapes (status:"ok" on success):
//   summary    → { kpis, weeklyTrend, stores, asOf }
//   products   → { products }      // top 20 departments
//   customers  → { segments }      // customer_category TY vs LY
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

