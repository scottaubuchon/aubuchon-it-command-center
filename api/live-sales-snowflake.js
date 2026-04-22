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
// SQL builders below take an optional storeFilter (already normalized to
// uppercase alphanumeric, so safe to interpolate) and an optional dateFilter
// (YYYY-MM-DD, validated by regex before reaching here). When dateFilter is
// null the queries use CURRENT_DATE() — i.e. today's live snapshot. When
// set, every aggregate is scoped to that specific date, letting the UI
// browse past days. We don't use SDK binds because Snowflake's Node SDK
// uses positional `?` placeholders, and the same value is referenced
// multiple times across the queries — string interpolation is simpler.
function buildCompanySql(storeFilter, dateFilter) {
  const lsCond = storeFilter ? `AND ls.STORE_CD = '${storeFilter}'` : "";
  const planCond = storeFilter ? `AND sbd.LOCATION_CD = '${storeFilter}'` : "";
  const dateExpr = dateFilter ? `TO_DATE('${dateFilter}')` : "CURRENT_DATE()";
  return `
WITH today_sales AS (
  SELECT
    SUM(ls.NET_SALES)                          AS sales,
    SUM(ls.NET_SALES - ls.COST_OF_GOODS)       AS gp,
    SUM(ls.TRANSACTION_CNT)                    AS txns,
    SUM(ls.CUSTOMER_CNT)                       AS customers,
    COUNT(DISTINCT ls.STORE_CD)                AS store_count,
    MAX(ls.LAST_UPDATED_TS)                    AS as_of_ts
  FROM PRD_EDW_DB.ANALYTICS_BASE.FCT_LIVE_SALE ls
  WHERE ls.CURRENT_DT = ${dateExpr} ${lsCond}
),
today_plan AS (
  -- Per-day plan from the scorecard. Matches YODA's source. Do NOT use
  -- RPT_PAYROLL_BUDGET_AND_ACTUALS/7 — days of week have different plans.
  SELECT SUM(sbd.TARGET_DAILY_SALES_AMT) AS daily_plan
  FROM PRD_EDW_DB.ANALYTICS_BASE.RPT_SCORECARD_BY_DAY sbd
  WHERE sbd.TRANSACTION_DT = ${dateExpr} ${planCond}
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
}

function buildStoresSql(storeFilter, dateFilter) {
  const todayCond = storeFilter ? `AND STORE_CD = '${storeFilter}'` : "";
  const planCond  = storeFilter ? `AND LOCATION_CD = '${storeFilter}'` : "";
  const dateExpr  = dateFilter ? `TO_DATE('${dateFilter}')` : "CURRENT_DATE()";
  return `
WITH today AS (
  SELECT STORE_CD, NET_SALES, NET_SALES - COST_OF_GOODS AS GP, TRANSACTION_CNT
  FROM PRD_EDW_DB.ANALYTICS_BASE.FCT_LIVE_SALE
  WHERE CURRENT_DT = ${dateExpr} ${todayCond}
),
store_plan AS (
  -- Per-day plan from the scorecard (LOCATION_CD == STORE_CD). Matches YODA.
  SELECT LOCATION_CD AS STORE_CD, TARGET_DAILY_SALES_AMT AS daily_plan
  FROM PRD_EDW_DB.ANALYTICS_BASE.RPT_SCORECARD_BY_DAY
  WHERE TRANSACTION_DT = ${dateExpr} ${planCond}
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
}

function buildProductsSql(storeFilter, dateFilter) {
  const cond = storeFilter ? `AND STORE_CD = '${storeFilter}'` : "";
  const dateExpr = dateFilter ? `TO_DATE('${dateFilter}')` : "CURRENT_DATE()";
  return `
SELECT PRODUCT_DESC AS product, SUM(ITEM_EXTENDED_AMT) AS sales
FROM PRD_EDW_DB.ANALYTICS_BASE.FCT_LIVE_SALE_TRANSACTION_LINE
WHERE CREATED_DT = ${dateExpr}
  AND PRODUCT_DESC IS NOT NULL
  ${cond}
GROUP BY PRODUCT_DESC
ORDER BY sales DESC NULLS LAST
LIMIT 20
`;
}

// Stores that had a daily plan > 0 but did NOT send a FCT_LIVE_SALE row for
// the date in question. Mirrors the YODA logic in live-sales.js: the plan
// universe comes from RPT_SCORECARD_BY_DAY so we don't flag closed/inactive
// stores that simply aren't expected to sell. Filters store 000 for parity
// with the dropdown. Company-wide only — when a single store is selected the
// "not reporting" concept doesn't apply, so the handler skips this query.
function buildNotReportingSql(dateFilter) {
  const dateExpr = dateFilter ? `TO_DATE('${dateFilter}')` : "CURRENT_DATE()";
  return `
SELECT
  sbd.LOCATION_CD               AS store,
  ds.STORE_NM                   AS name,
  ds.STORE_CITY_NM              AS city,
  ds.STORE_STATE_CD             AS state,
  sbd.TARGET_DAILY_SALES_AMT    AS plan
FROM PRD_EDW_DB.ANALYTICS_BASE.RPT_SCORECARD_BY_DAY sbd
LEFT JOIN PRD_EDW_DB.ANALYTICS_BASE.FCT_LIVE_SALE ls
  ON ls.STORE_CD = sbd.LOCATION_CD
 AND ls.CURRENT_DT = ${dateExpr}
LEFT JOIN PRD_EDW_DB.ANALYTICS_BASE.DIM_STORE ds
  ON ds.STORE_CD = sbd.LOCATION_CD
 AND ds.ACTIVE_FLG = TRUE
WHERE sbd.TRANSACTION_DT = ${dateExpr}
  AND sbd.TARGET_DAILY_SALES_AMT > 0
  AND ls.STORE_CD IS NULL
  AND sbd.LOCATION_CD <> '000'
ORDER BY sbd.TARGET_DAILY_SALES_AMT DESC NULLS LAST
`;
}

// Lightweight list of every active store, used to populate the store
// dropdown on the front-end. Cheap to query — small dimension table.
// Excludes store 000 (warehouse / non-retail placeholder that users don't
// need to see in the dropdown).
const ALL_STORES_SQL = `
SELECT STORE_CD AS store, STORE_NM AS name, STORE_CITY_NM AS city, STORE_STATE_CD AS state
FROM PRD_EDW_DB.ANALYTICS_BASE.DIM_STORE
WHERE ACTIVE_FLG = TRUE
  AND STORE_CD <> '000'
ORDER BY STORE_CD
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
// ---------- History cache (past-date, company-wide only) ----------
// Past days don't change — we cache the payload as a JSON file in the repo
// under public/data/live-sales-snowflake/history/YYYY-MM-DD.json so every
// future click of that date is ~instant and free. Writes use the GitHub
// Contents API with the GITHUB_TOKEN env var (same one the live-sales
// logger uses). Reads go through api.github.com too for freshness — the
// Vercel CDN copy may lag a commit or two behind the last write.
const CACHE_REPO  = "scottaubuchon/aubuchon-it-command-center";
const CACHE_BRANCH = "main";

function cachePathFor(date) {
  return `public/data/live-sales-snowflake/history/${date}.json`;
}

async function readHistoryCache(date) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return null;
  const path = cachePathFor(date);
  try {
    const r = await fetch(
      `https://api.github.com/repos/${CACHE_REPO}/contents/${path}?ref=${CACHE_BRANCH}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "lss-history-cache",
        },
      }
    );
    if (r.status === 404) return null;
    if (!r.ok) return null;
    const j = await r.json();
    if (!j || !j.content) return null;
    const decoded = Buffer.from(j.content, "base64").toString("utf-8");
    return JSON.parse(decoded);
  } catch (err) {
    console.error("[live-sales-snowflake] cache read error:", err && err.message);
    return null;
  }
}

async function writeHistoryCache(date, payload) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return;
  const path = cachePathFor(date);
  const json = JSON.stringify({
    ...payload,
    cached: true,
    cachedAt: new Date().toISOString(),
  }, null, 2);
  const content = Buffer.from(json, "utf-8").toString("base64");

  // Look up existing SHA in case we're overwriting an older write.
  let sha = null;
  try {
    const r = await fetch(
      `https://api.github.com/repos/${CACHE_REPO}/contents/${path}?ref=${CACHE_BRANCH}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "lss-history-cache",
        },
      }
    );
    if (r.ok) {
      const j = await r.json();
      if (j && j.sha) sha = j.sha;
    }
  } catch (_) { /* first write; no SHA needed */ }

  const body = {
    message: `chore(cache): freeze live-sales snapshot for ${date} [skip ci]`,
    content,
    branch: CACHE_BRANCH,
  };
  if (sha) body.sha = sha;

  const r = await fetch(`https://api.github.com/repos/${CACHE_REPO}/contents/${path}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "lss-history-cache",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    throw new Error(`cache write HTTP ${r.status}: ${await r.text()}`);
  }
}

function todayInET() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

// Integer days between two YYYY-MM-DD strings (a - b). Both interpreted as
// UTC midnight, which is safe since we only ever subtract same-form values.
// We don't care about DST/time-zone drift at day granularity.
function daysBetweenIsoDates(a, b) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) return 0;
  const aMs = Date.UTC(+a.slice(0,4), +a.slice(5,7)-1, +a.slice(8,10));
  const bMs = Date.UTC(+b.slice(0,4), +b.slice(5,7)-1, +b.slice(8,10));
  return Math.round((aMs - bMs) / 86400000);
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

  // Optional store filter — when present, every aggregate is scoped to that
  // single store. Normalize to upper-case alphanumeric (matches DIM_STORE).
  let storeFilter = null;
  try {
    const raw = (req.query && req.query.store) || "";
    const cleaned = String(raw).trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (cleaned) storeFilter = cleaned;
  } catch (_) { storeFilter = null; }

  // Optional date filter — when set, every query is scoped to that day
  // rather than CURRENT_DATE(). Accepts only strict YYYY-MM-DD; anything
  // else (including future dates that pass regex) is left to Snowflake to
  // return zero rows for. We deliberately compare as a literal DATE.
  let dateFilter = null;
  try {
    const raw = (req.query && req.query.date) || "";
    const cleaned = String(raw).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) dateFilter = cleaned;
  } catch (_) { dateFilter = null; }

  // Fast path: past-date, company-wide queries are served from the
  // repo-file cache when available. Snowflake is only queried on cache
  // miss, and we re-write the cache before responding so the next hit is
  // free. Per-store and today-live queries bypass the cache.
  const etToday = todayInET();
  const cacheable = Boolean(dateFilter) && !storeFilter && dateFilter !== etToday;
  if (cacheable) {
    const cached = await readHistoryCache(dateFilter);
    if (cached) {
      // Cache "provisional" window: snapshots 1-2 days old with still-missing
      // stores are re-checked in case those stores have since posted late
      // data. After day+2 (or when no stores are missing) the cache is
      // treated as final and served as-is. This matches the spirit of the
      // logger's once-a-day cadence while giving late-reporters a chance to
      // roll in without a manual cache bust.
      const daysOld = daysBetweenIsoDates(etToday, dateFilter);
      const missingCount = Array.isArray(cached.notReporting) ? cached.notReporting.length : 0;
      const provisional = daysOld >= 1 && daysOld <= 2 && missingCount > 0;

      if (!provisional) {
        res.status(200).json({
          ...cached,
          // Keep echoed filters accurate for the current request.
          storeFilter,
          dateFilter,
          // Mark as served from cache so the UI can show a badge.
          cached: true,
          source: cached.source || "snowflake",
        });
        return;
      }
      // else: fall through to a fresh Snowflake query. The subsequent
      // cache write will overwrite this provisional snapshot with the
      // latest data, including any previously-missing stores that have
      // since reported.
      console.log("[live-sales-snowflake] provisional cache refresh for", dateFilter,
        "(daysOld=" + daysOld + ", missing=" + missingCount + ")");
    }
  }

  let conn = null;
  // Wrap exec so a single bad query (most likely the new ALL_STORES_SQL or
  // a per-store filter against an unexpected column) doesn't take down the
  // whole endpoint. We capture each failure and surface it in the payload.
  const safeExec = async (label, sql) => {
    try { return { rows: await exec(conn, sql), error: null, label }; }
    catch (err) {
      console.error(`[live-sales-snowflake] ${label} failed:`, err && err.message);
      return { rows: [], error: (err && err.message) || String(err), label };
    }
  };

  try {
    conn = await connect();
    // Stores-not-reporting is company-wide only; when a single store is
    // selected we skip that query and return an empty list. We still run it
    // for both today's live view and past-date cache misses so the resulting
    // JSON snapshot carries the complete picture.
    const notReportingPromise = storeFilter
      ? Promise.resolve({ rows: [], error: null, label: "notReporting" })
      : safeExec("notReporting", buildNotReportingSql(dateFilter));
    const [companyRes, storeRes, productRes, allStoreRes, notReportingRes] = await Promise.all([
      safeExec("company",   buildCompanySql(storeFilter, dateFilter)),
      safeExec("stores",    buildStoresSql(storeFilter, dateFilter)),
      safeExec("products",  buildProductsSql(storeFilter, dateFilter)),
      safeExec("allStores", ALL_STORES_SQL),
      notReportingPromise,
    ]);

    // Collect any per-query errors so the front-end can show them. We only
    // hard-fail (HTTP 500) if BOTH the company total AND the stores query
    // failed — meaning we have nothing useful to show. Otherwise return 200
    // with whatever data we did get.
    const queryErrors = [companyRes, storeRes, productRes, allStoreRes, notReportingRes]
      .filter((r) => r.error)
      .map((r) => ({ query: r.label, error: r.error }));
    if (companyRes.error && storeRes.error) {
      const msg = queryErrors.map((e) => `${e.query}: ${e.error}`).join(" | ");
      throw new Error(msg || "All Snowflake queries failed");
    }

    const companyRows      = companyRes.rows;
    const storeRows        = storeRes.rows;
    const productRows      = productRes.rows;
    const allStoreRows     = allStoreRes.rows;
    const notReportingRows = notReportingRes.rows;

    const c = companyRows[0] || {};
    const sales = toNumber(c.SALES);
    const plan  = toNumber(c.PLAN);
    const gp    = toNumber(c.GP);
    const gpPct = sales > 0 ? (gp / sales) * 100 : 0;
    const pctToPlan = plan > 0 ? (sales / plan) * 100 : 0;

    const payload = {
      status: "ok",
      storeFilter,           // null = company-wide, otherwise the store code
      dateFilter,            // null = today, otherwise "YYYY-MM-DD"
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
      // Full active-store list for populating the dropdown. Small dim table,
      // ~150 rows, so we just return it on every call.
      allStores: allStoreRows.map((r) => ({
        store: r.STORE,
        name:  r.NAME,
        city:  r.CITY,
        state: r.STATE,
      })),
      // Stores with a daily plan > 0 that haven't reported any sales yet.
      // Empty when a single store is selected (the concept only applies
      // company-wide). The UI additionally only surfaces this for today's
      // live view — past dates don't have a meaningful "missing" list.
      notReporting: notReportingRows.map((r) => ({
        store: r.STORE,
        name:  r.NAME,
        city:  r.CITY,
        state: r.STATE,
        plan:  toNumber(r.PLAN),
      })),
      asOfET: dateFilter
        ? ("End of day · " + dateFilter)
        : (fmtAsOfET(c.AS_OF_TS) + " ET"),
      cached: false,
      refreshedAt: new Date().toISOString(),
      source: "snowflake",
      queryErrors: queryErrors.length ? queryErrors : undefined,
    };

    // Persist this date's snapshot so future requests skip Snowflake.
    // Non-fatal: logged and swallowed if GitHub rejects the write.
    if (cacheable) {
      try {
        await writeHistoryCache(dateFilter, payload);
      } catch (err) {
        console.error("[live-sales-snowflake] cache write failed:", err && err.message);
      }
    }

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
