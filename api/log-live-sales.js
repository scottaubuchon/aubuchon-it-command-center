import https from 'https';

// ============================================================
// Live Sales Logger + Predictor
// Runs every 10 minutes (7am-9pm ET) via Cowork scheduled task.
//
// What it does:
//   1. Fetches the current day's live sales summary from /api/live-sales
//   2. Appends a single JSON line to public/data/live-sales/{YYYY-MM-DD}.jsonl
//      on GitHub (committed with [skip ci] so Vercel does not redeploy)
//   3. Loads the most recent same-day-of-week history files to learn the
//      typical "pace curve" (what % of EOD sales has usually happened by
//      this hour:minute on this DOW)
//   4. Projects end-of-day sales = current_sales / avg_pace_at_this_time
//   5. Writes a small public/data/live-sales/prediction.json the dashboard
//      can read without any server-side logic.
// ============================================================

const GH_OWNER = 'scottaubuchon';
const GH_REPO = 'aubuchon-it-command-center';
// Set GITHUB_TOKEN in Vercel env vars (Settings > Environment Variables).
// A fine-grained PAT with Contents: Read/Write on this repo is sufficient.
const GH_TOKEN = process.env.GITHUB_TOKEN || '';
const LIVE_SALES_URL = 'https://aubuchon-it-command-center.vercel.app/api/live-sales?refresh=true';
const LOG_DIR = 'public/data/live-sales';
// How many prior same-DOW files to consider when building the pace curve.
const HISTORY_LOOKBACK_WEEKS = 8;
// How many prior calendar days to consider for the any-DOW fallback curve.
const ANY_DOW_LOOKBACK_DAYS = 21;
// Assumed business day for the cold-start linear method (ET).
const BUSINESS_OPEN_HOUR = 7;   // 7 AM
const BUSINESS_CLOSE_HOUR = 20; // 8 PM

// --------- low-level HTTPS helpers (no external deps) ----------

function httpsJson(options, postBody, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        const status = res.statusCode || 0;
        try {
          const parsed = data ? JSON.parse(data) : null;
          resolve({ status, body: parsed, raw: data });
        } catch (e) {
          resolve({ status, body: null, raw: data });
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs || 30000, () => { req.destroy(); reject(new Error('HTTPS timeout after ' + (timeoutMs || 30000) + 'ms')); });
    if (postBody) req.write(postBody);
    req.end();
  });
}

function ghGet(path) {
  return httpsJson({
    hostname: 'api.github.com',
    path: `/repos/${GH_OWNER}/${GH_REPO}/contents/${path}`,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${GH_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'AubuchonLiveSalesLogger/1.0',
    },
  });
}

function ghPut(path, contentB64, message, sha) {
  const payload = JSON.stringify({ message, content: contentB64, ...(sha ? { sha } : {}) });
  return httpsJson({
    hostname: 'api.github.com',
    path: `/repos/${GH_OWNER}/${GH_REPO}/contents/${path}`,
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${GH_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'AubuchonLiveSalesLogger/1.0',
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    },
  }, payload);
}

function fetchLiveSales() {
  const u = new URL(LIVE_SALES_URL);
  return httpsJson({
    hostname: u.hostname,
    path: u.pathname + u.search,
    method: 'GET',
    headers: { 'User-Agent': 'AubuchonLiveSalesLogger/1.0' },
  }, null, 100000); // Upstream can take 60s+ on a cold YODA refresh.
}

// --------- ET-aware date helpers ----------

function etParts(d = new Date()) {
  // en-CA gives YYYY-MM-DD formatting, en-US 24h gives HH:MM
  const date = d.toLocaleString('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
  const time = d.toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit' });
  const [y, m, dd] = date.split('-').map(Number);
  let [hh, mm] = time.split(':').map(Number);
  if (hh === 24) hh = 0; // midnight edge case from en-US
  // day-of-week (0=Sun..6=Sat) in ET
  const dowName = new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const dow = dowName.getDay();
  return {
    dateET: `${y}-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`,
    hourET: hh,
    minuteET: mm,
    dow,
    tsET: d.toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }),
  };
}

function priorSameDowDates(fromDateStr, count) {
  return priorDates(fromDateStr, count, 7);
}

function priorDates(fromDateStr, count, step) {
  // fromDateStr is YYYY-MM-DD (ET). Walk back `step` days at a time.
  const [y, m, d] = fromDateStr.split('-').map(Number);
  // Use noon UTC on that date to avoid DST drift when subtracting.
  const base = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const out = [];
  for (let i = 1; i <= count; i++) {
    const t = new Date(base.getTime() - i * step * 24 * 60 * 60 * 1000);
    const yy = t.getUTCFullYear();
    const mm = String(t.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(t.getUTCDate()).padStart(2, '0');
    out.push(`${yy}-${mm}-${dd}`);
  }
  return out;
}

function minutesOfDay(h, m) { return h * 60 + m; }

// --------- core logic ----------

async function appendLogLine(dateET, entry) {
  const path = `${LOG_DIR}/${dateET}.jsonl`;
  const existing = await ghGet(path);

  let prevText = '';
  let sha = null;
  if (existing.status === 200 && existing.body && existing.body.content) {
    prevText = Buffer.from(existing.body.content, 'base64').toString('utf8');
    sha = existing.body.sha;
    if (prevText.length && !prevText.endsWith('\n')) prevText += '\n';
  } else if (existing.status !== 404 && existing.status !== 200) {
    // Unknown failure — surface it but don't explode the whole run.
    return { ok: false, error: `GET ${path} -> ${existing.status}` };
  }

  const newText = prevText + JSON.stringify(entry) + '\n';
  const b64 = Buffer.from(newText, 'utf8').toString('base64');
  const put = await ghPut(path, b64, `chore: log live sales ${entry.tsET} [skip ci]`, sha);
  if (put.status >= 200 && put.status < 300) {
    return { ok: true, lineCount: newText.split('\n').filter(Boolean).length };
  }
  return { ok: false, error: `PUT ${path} -> ${put.status} ${put.raw?.slice(0, 200)}` };
}

async function loadHistoryDays(dates) {
  // Fetch all history days in parallel to keep the handler inside the scheduler's wall-clock budget.
  const fetched = await Promise.all(dates.map(async (d) => {
    const r = await ghGet(`${LOG_DIR}/${d}.jsonl`);
    if (r.status === 200 && r.body && r.body.content) {
      const text = Buffer.from(r.body.content, 'base64').toString('utf8');
      const rows = text.split('\n').filter(Boolean).map((ln) => {
        try { return JSON.parse(ln); } catch { return null; }
      }).filter(Boolean);
      if (rows.length >= 2) return { date: d, rows };
    }
    return null;
  }));
  return fetched.filter(Boolean);
}

// Build a pace-based projection from a set of history days. Returns null if
// no usable paces can be derived.
function paceProjection(currentEntry, history, label) {
  const curMin = minutesOfDay(currentEntry.hourET, currentEntry.minuteET);
  const paces = [];
  const eodList = [];
  const byDay = [];

  for (const h of history) {
    const rows = [...h.rows].sort((a, b) => minutesOfDay(a.hourET, a.minuteET) - minutesOfDay(b.hourET, b.minuteET));
    const eod = Math.max(...rows.map(r => Number(r.sales || 0)));
    if (!eod || eod <= 0) continue;
    eodList.push(eod);
    let at = null;
    for (const r of rows) {
      const mm = minutesOfDay(r.hourET, r.minuteET);
      if (mm <= curMin) at = r; else break;
    }
    if (!at) continue;
    const pace = Number(at.sales || 0) / eod;
    if (pace > 0 && pace <= 1) paces.push(pace);
    byDay.push({ date: h.date, eod, paceAtNow: pace, planHit: at.plan ? eod >= at.plan : null });
  }

  if (!paces.length) return null;

  let pacesSorted = [...paces].sort((a, b) => a - b);
  if (pacesSorted.length >= 4) pacesSorted = pacesSorted.slice(1, -1);
  const avgPace = pacesSorted.reduce((s, v) => s + v, 0) / pacesSorted.length;
  const projectedEOD = avgPace > 0 ? currentEntry.sales / avgPace : 0;
  const plan = Number(currentEntry.plan || 0);
  const minPace = Math.min(...paces);
  const maxPace = Math.max(...paces);
  const avgEOD = eodList.reduce((s, v) => s + v, 0) / eodList.length;

  // Confidence: more history = higher confidence.
  const confidence = paces.length >= 5 ? 'high' : paces.length >= 3 ? 'medium' : 'low';

  return {
    available: true,
    method: label,
    confidence,
    historyDays: paces.length,
    avgPaceAtNow: avgPace,
    avgHistoricalEOD: avgEOD,
    projectedEOD,
    projectedPctToPlan: plan > 0 ? (projectedEOD / plan) * 100 : null,
    projectedVariance: plan > 0 ? projectedEOD - plan : null,
    band: {
      low: maxPace > 0 ? currentEntry.sales / maxPace : 0,
      high: minPace > 0 ? currentEntry.sales / minPace : 0,
    },
    historyDetail: byDay,
  };
}

// Cold-start method — no history required. Assumes sales accumulate in
// proportion to elapsed business hours (7 AM – 8 PM ET). Useful on day 1
// before any same-DOW or any-DOW history exists.
function linearProjection(currentEntry) {
  const curMin = minutesOfDay(currentEntry.hourET, currentEntry.minuteET);
  const openMin = BUSINESS_OPEN_HOUR * 60;
  const closeMin = BUSINESS_CLOSE_HOUR * 60;
  const dayLen = closeMin - openMin;
  const elapsed = Math.max(0, Math.min(dayLen, curMin - openMin));
  const pctOfDay = elapsed / dayLen;
  const projectedEOD = pctOfDay > 0 ? currentEntry.sales / pctOfDay : 0;
  const plan = Number(currentEntry.plan || 0);
  return {
    available: true,
    method: 'cold-start linear (business hours)',
    confidence: 'very low',
    historyDays: 0,
    assumedBusinessHours: `${BUSINESS_OPEN_HOUR} AM – ${BUSINESS_CLOSE_HOUR - 12} PM ET`,
    pctOfDayElapsed: pctOfDay,
    projectedEOD,
    projectedPctToPlan: plan > 0 ? (projectedEOD / plan) * 100 : null,
    projectedVariance: plan > 0 ? projectedEOD - plan : null,
    note: 'Sales assumed to accumulate evenly across business hours. This is a naive starting point — every new run, once any history exists, it will be replaced by a pace-curve projection.',
  };
}

// Tiered prediction: pick the strongest method the current data supports.
// Tier 1 (best): same-day-of-week pace curve (needs >=1 prior same-DOW day).
// Tier 2 (fallback): any-day pace curve (needs >=1 prior day of any DOW).
// Tier 3 (cold start): linear extrapolation from business hours.
function buildPrediction(currentEntry, sameDowHistory, anyDowHistory) {
  const sameDow = paceProjection(currentEntry, sameDowHistory, 'same-day-of-week pace');
  if (sameDow) return sameDow;
  const anyDow = paceProjection(currentEntry, anyDowHistory, 'any-day pace (DOW-agnostic fallback)');
  if (anyDow) {
    anyDow.note = 'No same-day-of-week history yet. Using all prior days to estimate pace — will switch to DOW-specific as soon as a matching day is logged.';
    return anyDow;
  }
  return linearProjection(currentEntry);
}

async function writePrediction(obj) {
  const path = `${LOG_DIR}/prediction.json`;
  const existing = await ghGet(path);
  const sha = existing.status === 200 ? existing.body?.sha : null;
  const b64 = Buffer.from(JSON.stringify(obj, null, 2), 'utf8').toString('base64');
  const put = await ghPut(path, b64, `chore: update live sales prediction [skip ci]`, sha);
  return put.status >= 200 && put.status < 300;
}

// Mirror the full live-sales payload to public/data/live-sales/current.json so
// the dashboard can load instantly from raw.githubusercontent.com instead of
// waiting on the YODA-backed API. [skip ci] keeps Vercel from redeploying.
async function writeCurrentSnapshot(liveBody, prediction) {
  const path = `${LOG_DIR}/current.json`;
  const existing = await ghGet(path);
  const sha = existing.status === 200 ? existing.body?.sha : null;
  const snapshot = { ...liveBody, prediction, snapshotAt: new Date().toISOString() };
  const b64 = Buffer.from(JSON.stringify(snapshot), 'utf8').toString('base64');
  const put = await ghPut(path, b64, `chore: update live sales snapshot [skip ci]`, sha);
  return put.status >= 200 && put.status < 300;
}

// --------- Vercel handler ----------

export const config = { maxDuration: 120 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // 1) Pull current live data (forces a cache refresh).
    const live = await fetchLiveSales();
    if (live.status !== 200 || !live.body || live.body.status !== 'ok') {
      return res.status(502).json({ status: 'error', stage: 'fetch-live', detail: live.body || live.raw });
    }
    const d = live.body;
    const ct = d.companyTotal || {};

    // 2) Build log entry (ET-aware).
    const now = new Date();
    const et = etParts(now);
    const entry = {
      ts: now.toISOString(),
      tsET: et.tsET,
      dateET: et.dateET,
      hourET: et.hourET,
      minuteET: et.minuteET,
      dow: et.dow,
      sales: Number(ct.sales || 0),
      plan: Number(ct.plan || 0),
      pctToPlan: Number(ct.pctToPlan || 0),
      gp: Number(ct.gp || 0),
      gpPct: Number(ct.gpPct || 0),
      txns: Number(ct.txns || 0),
      customers: Number(ct.customers || 0),
      storeCount: Number(ct.storeCount || 0),
      asOf: d.asOf || null,
      asOfET: d.asOfET || null,
    };

    // 3) Append to today's log file.
    const appendResult = await appendLogLine(et.dateET, entry);

    // 4) Learn from history (same-DOW preferred, fall back to any-day, then linear).
    const sameDowDates = priorSameDowDates(et.dateET, HISTORY_LOOKBACK_WEEKS);
    const anyDowDates = priorDates(et.dateET, ANY_DOW_LOOKBACK_DAYS, 1);
    const [sameDowHistory, anyDowHistory] = await Promise.all([
      loadHistoryDays(sameDowDates),
      loadHistoryDays(anyDowDates),
    ]);
    const prediction = buildPrediction(entry, sameDowHistory, anyDowHistory);

    // 5) Persist prediction.json (even when unavailable — dashboard reads one file).
    const predictionDoc = {
      updatedAt: now.toISOString(),
      updatedAtET: et.tsET,
      dateET: et.dateET,
      dow: et.dow,
      current: entry,
      prediction,
    };
    const predWrote = await writePrediction(predictionDoc);

    // 6) Mirror the full live payload to a static file for fast dashboard loads.
    const snapshotWrote = await writeCurrentSnapshot(d, predictionDoc);

    return res.status(200).json({
      status: 'ok',
      log: { file: `${LOG_DIR}/${et.dateET}.jsonl`, ...appendResult },
      prediction: predictionDoc,
      predictionWritten: predWrote,
      snapshotWritten: snapshotWrote,
    });
  } catch (e) {
    return res.status(500).json({ status: 'error', error: e.message, stack: e.stack });
  }
}
