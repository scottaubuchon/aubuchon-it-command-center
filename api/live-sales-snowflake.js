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
// Integer date key (YYYYMMDD) used by the AGG_SALES_DAY_* tables for historical
// lookups. Call with a YYYY-MM-DD string; returns a plain integer safe to
// interpolate into SQL.
function dateKeyOf(dateFilter) {
  return parseInt(dateFilter.replace(/-/g, ""), 10);
}

function buildCompanySql(storeFilter, dateFilter) {
  const planCond = storeFilter ? `AND sbd.LOCATION_CD = '${storeFilter}'` : "";
  const planDate = dateFilter ? `TO_DATE('${dateFilter}')` : "CURRENT_DATE()";

  // Historical path: FCT_LIVE_SALE only holds today's data, so past-date
  // queries read the daily-granularity aggregate instead. Customer count is
  // not tracked in AGG_SALES_DAY_STORE_ALL, so it's returned as 0 for past
  // dates — the UI doesn't surface customer count prominently anyway.
  if (dateFilter) {
    const aggCond = storeFilter ? `AND STORE_CD = '${storeFilter}'` : "";
    const dateKey = dateKeyOf(dateFilter);
    return `
WITH day_sales AS (
  SELECT
    SUM(NET_SALE_GL_AMT)                       AS sales,
    SUM(GROSS_PROFIT_AMT)                      AS gp,
    SUM(TRANSACTION_CNT)                       AS txns,
    COUNT(DISTINCT STORE_CD)                   AS store_count
  FROM PRD_EDW_DB.ANALYTICS_BASE.AGG_SALES_DAY_STORE_ALL
  WHERE TRANSACTION_DATE_KEY = ${dateKey} ${aggCond}
),
day_plan AS (
  SELECT SUM(sbd.TARGET_DAILY_SALES_AMT) AS daily_plan
  FROM PRD_EDW_DB.ANALYTICS_BASE.RPT_SCORECARD_BY_DAY sbd
  WHERE sbd.TRANSACTION_DT = ${planDate} ${planCond}
)
SELECT
  COALESCE(ds.sales, 0)       AS sales,
  COALESCE(dp.daily_plan, 0)  AS plan,
  COALESCE(ds.gp, 0)          AS gp,
  COALESCE(ds.txns, 0)        AS txns,
  0                           AS customers,
  COALESCE(ds.store_count, 0) AS store_count,
  NULL                        AS as_of_ts
FROM day_sales ds CROSS JOIN day_plan dp
`;
  }

  // Today: live table.
  const lsCond = storeFilter ? `AND ls.STORE_CD = '${storeFilter}'` : "";
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
  WHERE ls.CURRENT_DT = CURRENT_DATE() ${lsCond}
),
today_plan AS (
  -- Per-day plan from the scorecard. Matches YODA's source. Do NOT use
  -- RPT_PAYROLL_BUDGET_AND_ACTUALS/7 — days of week have different plans.
  SELECT SUM(sbd.TARGET_DAILY_SALES_AMT) AS daily_plan
  FROM PRD_EDW_DB.ANALYTICS_BASE.RPT_SCORECARD_BY_DAY sbd
  WHERE sbd.TRANSACTION_DT = CURRENT_DATE() ${planCond}
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
  const planCond = storeFilter ? `AND LOCATION_CD = '${storeFilter}'` : "";
  const planDate = dateFilter ? `TO_DATE('${dateFilter}')` : "CURRENT_DATE()";

  // Historical path — AGG_SALES_DAY_STORE_ALL carries its own STORE_NM, but
  // we still join DIM_STORE for city/state which aren't in the agg table.
  if (dateFilter) {
    const aggCond = storeFilter ? `AND asd.STORE_CD = '${storeFilter}'` : "";
    const dateKey = dateKeyOf(dateFilter);
    return `
WITH day_store AS (
  SELECT
    asd.STORE_CD,
    asd.STORE_NM,
    asd.NET_SALE_GL_AMT AS NET_SALES,
    asd.GROSS_PROFIT_AMT AS GP,
    asd.TRANSACTION_CNT
  FROM PRD_EDW_DB.ANALYTICS_BASE.AGG_SALES_DAY_STORE_ALL asd
  WHERE asd.TRANSACTION_DATE_KEY = ${dateKey} ${aggCond}
),
store_plan AS (
  SELECT LOCATION_CD AS STORE_CD, TARGET_DAILY_SALES_AMT AS daily_plan
  FROM PRD_EDW_DB.ANALYTICS_BASE.RPT_SCORECARD_BY_DAY
  WHERE TRANSACTION_DT = ${planDate} ${planCond}
)
SELECT
  t.STORE_CD               AS store,
  COALESCE(ds.STORE_NM, t.STORE_NM) AS name,
  ds.STORE_CITY_NM         AS city,
  ds.STORE_STATE_CD        AS state,
  t.NET_SALES              AS sales,
  COALESCE(sp.daily_plan, 0) AS plan,
  t.GP                     AS gp,
  t.TRANSACTION_CNT        AS txns
FROM day_store t
LEFT JOIN PRD_EDW_DB.ANALYTICS_BASE.DIM_STORE ds
  ON ds.STORE_CD = t.STORE_CD AND ds.ACTIVE_FLG = TRUE
LEFT JOIN store_plan sp ON sp.STORE_CD = t.STORE_CD
ORDER BY t.NET_SALES DESC NULLS LAST
LIMIT 20
`;
  }

  // Today — live table.
  const todayCond = storeFilter ? `AND STORE_CD = '${storeFilter}'` : "";
  return `
WITH today AS (
  SELECT STORE_CD, NET_SALES, NET_SALES - COST_OF_GOODS AS GP, TRANSACTION_CNT
  FROM PRD_EDW_DB.ANALYTICS_BASE.FCT_LIVE_SALE
  WHERE CURRENT_DT = CURRENT_DATE() ${todayCond}
),
store_plan AS (
  -- Per-day plan from the scorecard (LOCATION_CD == STORE_CD). Matches YODA.
  SELECT LOCATION_CD AS STORE_CD, TARGET_DAILY_SALES_AMT AS daily_plan
  FROM PRD_EDW_DB.ANALYTICS_BASE.RPT_SCORECARD_BY_DAY
  WHERE TRANSACTION_DT = CURRENT_DATE() ${planCond}
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
  if (dateFilter) {
    // Historical path — daily product aggregate joined to product dim.
    const aggCond = storeFilter
      ? `AND asp.STORE_KEY IN (SELECT STORE_KEY FROM PRD_EDW_DB.ANALYTICS_BASE.DIM_STORE WHERE STORE_CD = '${storeFilter}')`
      : "";
    const dateKey = dateKeyOf(dateFilter);
    return `
SELECT dp.PRODUCT_CD AS sku, dp.PRODUCT_DESC AS product, SUM(asp.NET_SALE_GL_AMT) AS sales
FROM PRD_EDW_DB.ANALYTICS_BASE.AGG_SALES_DAY_STORE_PRODUCT asp
LEFT JOIN PRD_EDW_DB.ANALYTICS_BASE.DIM_PRODUCT dp ON dp.PRODUCT_KEY = asp.PRODUCT_KEY
WHERE asp.TRANSACTION_DATE_KEY = ${dateKey}
  AND dp.PRODUCT_DESC IS NOT NULL
  ${aggCond}
GROUP BY dp.PRODUCT_CD, dp.PRODUCT_DESC
ORDER BY sales DESC NULLS LAST
LIMIT 100
`;
  }

  // Today — live line table.
  const cond = storeFilter ? `AND STORE_CD = '${storeFilter}'` : "";
  return `
SELECT PRODUCT_CD AS sku, PRODUCT_DESC AS product, SUM(ITEM_EXTENDED_AMT) AS sales
FROM PRD_EDW_DB.ANALYTICS_BASE.FCT_LIVE_SALE_TRANSACTION_LINE
WHERE CREATED_DT = CURRENT_DATE()
  AND PRODUCT_DESC IS NOT NULL
  ${cond}
GROUP BY PRODUCT_CD, PRODUCT_DESC
ORDER BY sales DESC NULLS LAST
LIMIT 100
`;
}

// Stores that had a daily plan > 0 but did NOT send a FCT_LIVE_SALE row for
// the date in question. Mirrors the YODA logic in live-sales.js: the plan
// universe comes from RPT_SCORECARD_BY_DAY so we don't flag closed/inactive
// stores that simply aren't expected to sell. Filters store 000 for parity
// with the dropdown. Company-wide only — when a single store is selected the
// "not reporting" concept doesn't apply, so the handler skips this query.
function buildNotReportingSql(dateFilter) {
  const planDate = dateFilter ? `TO_DATE('${dateFilter}')` : "CURRENT_DATE()";
  // For historical dates we anti-join against the day-level agg table rather
  // than the today-only live feed. For today's view we keep the FCT_LIVE_SALE
  // anti-join because that's what "hasn't reported yet" actually means.
  let actualsJoin;
  if (dateFilter) {
    const dateKey = dateKeyOf(dateFilter);
    actualsJoin = `
LEFT JOIN PRD_EDW_DB.ANALYTICS_BASE.AGG_SALES_DAY_STORE_ALL act
  ON act.STORE_CD = sbd.LOCATION_CD
 AND act.TRANSACTION_DATE_KEY = ${dateKey}`;
  } else {
    actualsJoin = `
LEFT JOIN PRD_EDW_DB.ANALYTICS_BASE.FCT_LIVE_SALE act
  ON act.STORE_CD = sbd.LOCATION_CD
 AND act.CURRENT_DT = CURRENT_DATE()`;
  }
  return `
SELECT
  sbd.LOCATION_CD               AS store,
  ds.STORE_NM                   AS name,
  ds.STORE_CITY_NM              AS city,
  ds.STORE_STATE_CD             AS state,
  sbd.TARGET_DAILY_SALES_AMT    AS plan
FROM PRD_EDW_DB.ANALYTICS_BASE.RPT_SCORECARD_BY_DAY sbd
${actualsJoin}
LEFT JOIN PRD_EDW_DB.ANALYTICS_BASE.DIM_STORE ds
  ON ds.STORE_CD = sbd.LOCATION_CD
 AND ds.ACTIVE_FLG = TRUE
WHERE sbd.TRANSACTION_DT = ${planDate}
  AND sbd.TARGET_DAILY_SALES_AMT > 0
  AND act.STORE_CD IS NULL
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

// ---------- Missing-store estimation ----------
// For any store with a plan today that hasn't reported sales yet, estimate its
// contribution using its own historical same-DOW average. Pace is derived by
// comparing reporting peers' current sales against their own historical
// same-DOW EOD average — i.e. "if peers have hit 65% of their typical same-DOW
// sales so far, assume the missing stores are also at ~65% of theirs." This
// mirrors the `estimateOfflineSales()` pattern already used by YODA's
// log-live-sales.js logger (dowEOD × paceAtNow).
//
// Returns an array of YYYYMMDD integer keys for the previous N occurrences of
// the target date's day-of-week — e.g. called with ("2026-04-21", 8) returns
// the 8 prior Tuesdays. Used as a literal IN-list in the DOW-avg SQL so we
// never rely on Snowflake-side date arithmetic.
function dowDateKeys(targetIsoDate, weeksBack) {
  const base = new Date(targetIsoDate + "T12:00:00Z");
  const keys = [];
  for (let i = 1; i <= weeksBack; i++) {
    const prev = new Date(base);
    prev.setUTCDate(base.getUTCDate() - 7 * i);
    const iso = prev.toISOString().slice(0, 10);
    keys.push(parseInt(iso.replace(/-/g, ""), 10));
  }
  return keys;
}

// One query, small result (~150 rows). Returns per-store historical same-DOW
// averages over the provided date keys. Store 000 is excluded so it doesn't
// pollute the company-wide denominator.
function buildDowAvgSql(dowKeys) {
  return `
SELECT
  STORE_CD                 AS store,
  AVG(NET_SALE_GL_AMT)     AS dow_avg,
  COUNT(*)                 AS samples
FROM PRD_EDW_DB.ANALYTICS_BASE.AGG_SALES_DAY_STORE_ALL
WHERE TRANSACTION_DATE_KEY IN (${dowKeys.join(",")})
  AND STORE_CD <> '000'
GROUP BY STORE_CD
`;
}

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

// Cache path includes a version segment so old snapshots written under a
// different metric definition are skipped automatically. Bump when the SQL
// behind the snapshot changes in a way that would shift the totals.
//   v1     - original NET_SALE_AMT-based snapshots
//   v2-gl  - NET_SALE_GL_AMT (matches YODA "Sales TY" / scorecard ACTUAL_SALES_AMT)
const CACHE_VERSION = "v2-gl";
function cachePathFor(date) {
  return `public/data/live-sales-snowflake/history/${CACHE_VERSION}/${date}.json`;
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
      // Cache "provisional" window: snapshots up to 14 days old that still
      // have missing stores are re-checked in case those stores have since
      // posted late data. The Ithaca stores (233, 234) in particular are not
      // on the live feed and their actuals typically land the next day, but
      // can be delayed by several days — so a tight 1-2 day window misses
      // late-arriving Ithaca actuals. After day+14 (or when no stores are
      // missing) the cache is treated as final and served as-is. This gives
      // late-reporters a comfortable window to roll in without a manual cache
      // bust, while still capping Snowflake hits for very old dates.
      const daysOld = daysBetweenIsoDates(etToday, dateFilter);
      const missingCount = Array.isArray(cached.notReporting) ? cached.notReporting.length : 0;
      const provisional = daysOld >= 1 && daysOld <= 14 && missingCount > 0;

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

    // Missing-store estimation — only fires company-wide when at least one
    // store is flagged as not reporting. Uses each missing store's historical
    // same-DOW NET_SALE_GL_AMT average as its expected EOD, then scales by a
    // peer-based pace factor (reporting stores' current total / their own
    // historical same-DOW total). For past-date views the day is already over,
    // so pace is forced to 1.0 and estimatedCurrent == estimatedEOD.
    let estimatedMissing = null;
    if (!storeFilter && notReportingRows.length > 0) {
      const targetDate = dateFilter || etToday;
      const dowKeys = dowDateKeys(targetDate, 8);
      const dowRes = await safeExec("dowAvg", buildDowAvgSql(dowKeys));
      if (dowRes.error) {
        queryErrors.push({ query: dowRes.label, error: dowRes.error });
      } else if (dowRes.rows.length) {
        // Index DOW averages by store code for fast lookup.
        const dowByStore = new Map();
        for (const row of dowRes.rows) {
          dowByStore.set(String(row.STORE), {
            dowAvg: toNumber(row.DOW_AVG),
            samples: toNumber(row.SAMPLES),
          });
        }

        // Split the company's historical DOW total into "reporting" vs
        // "missing" halves so we can compute pace = reporting_actual /
        // reporting_dow_avg without needing a second SQL round-trip.
        const missingCodes = new Set(notReportingRows.map((r) => String(r.STORE)));
        let reportingDowTotal = 0;
        for (const [code, v] of dowByStore.entries()) {
          if (!missingCodes.has(code)) reportingDowTotal += v.dowAvg;
        }

        // Pace for today: how far through the DOW average reporting peers are.
        // Clamp to [0, 1.2] to keep a freak spike from blowing up the estimate.
        // For historical dates the day is done — force pace to 1.0.
        let paceAtNow = 1.0;
        if (!dateFilter && reportingDowTotal > 0) {
          paceAtNow = sales / reportingDowTotal;
          if (!isFinite(paceAtNow) || paceAtNow < 0) paceAtNow = 0;
          if (paceAtNow > 1.2) paceAtNow = 1.2;
        }

        // Build per-store estimates. If a missing store has no DOW history
        // (brand-new), fall back to (plan × pace) so the row still carries a
        // reasonable number rather than zero.
        let totalEstimatedCurrent = 0;
        let totalEstimatedEOD     = 0;
        const storesOut = notReportingRows.map((r) => {
          const code = String(r.STORE);
          const hist = dowByStore.get(code);
          const planAmt = toNumber(r.PLAN);
          const dowAvg = hist ? hist.dowAvg : 0;
          const samples = hist ? hist.samples : 0;
          const basis = dowAvg > 0 ? dowAvg : planAmt;
          const basisSource = dowAvg > 0 ? "dowAvg" : "plan";
          const estEOD     = basis;
          const estCurrent = basis * paceAtNow;
          totalEstimatedEOD     += estEOD;
          totalEstimatedCurrent += estCurrent;
          return {
            store: code,
            dowAvg,
            samples,
            basis: basisSource,
            plan: planAmt,
            estimatedCurrent: estCurrent,
            estimatedEOD: estEOD,
          };
        });

        estimatedMissing = {
          paceAtNow,
          sampleWeeks: 8,
          stores: storesOut,
          totalEstimatedCurrent,
          totalEstimatedEOD,
          projectedCompanyEOD: sales + totalEstimatedEOD,
          projectedCompanyCurrent: sales + totalEstimatedCurrent,
        };
      }
    }

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
        sku:     r.SKU,
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
      // Per-store estimates for non-reporting stores. Null when everyone has
      // reported or a single store is selected. The UI shows these as
      // clearly-labeled "est." values next to each missing store and a
      // projected-company-total line underneath companyTotal.sales.
      estimatedMissing,
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
