import https from 'https';

// ============================================================
// Live Sales Logger + Predictor  (v2 — plan-anchored + weather)
// Runs every 10 minutes (7am-9pm ET) via scheduled task.
//
// FORECAST MODEL (see baseline.json for factor values):
//   level_EOD = plan * recencyFactor * dowPlanRatio[dow] * holidayMult * weatherMult
//   shape_EOD = currentSales / paceCurve[dow][hh:mm]
//   projectedEOD = w * shape_EOD + (1-w) * level_EOD
//   where w ramps from ~0 at open to ~1 at close (sigmoid over % of day elapsed)
//
// Weather is fetched at runtime from NOAA NWS (api.weather.gov) for the 6
// station points in baseline.weatherStations, classified into seasonal
// condition keys, and looked up in baseline.weatherPriors.
// ============================================================

const GH_OWNER = 'scottaubuchon';
const GH_REPO = 'aubuchon-it-command-center';
const GH_TOKEN = process.env.GITHUB_TOKEN || '';
const BASE_URL = 'https://aubuchon-it-command-center.vercel.app';
// SHARED tuning surface — baseline and offline-stores live in YODA's dir and are
// read by both YODA- and Snowflake-sourced runs. Per-source logs, current.json
// and prediction.json live in `public/data/live-sales{-snowflake}/` respectively.
const SHARED_DIR = 'public/data/live-sales';
const BASELINE_PATH = `${SHARED_DIR}/baseline.json`;
const OFFLINE_STORES_PATH = `${SHARED_DIR}/offline-stores.json`;
const SOURCES = {
  yoda:      { liveSalesUrl: `${BASE_URL}/api/live-sales?refresh=true`, logDir: 'public/data/live-sales' },
  snowflake: { liveSalesUrl: `${BASE_URL}/api/live-sales-snowflake`,    logDir: 'public/data/live-sales-snowflake' },
};

const BUSINESS_OPEN_HOUR = 7;    // 7 AM ET
const BUSINESS_CLOSE_HOUR = 20;  // 8 PM ET  (Sunday closes at 17/5pm — handled by pace curve)

// --------- HTTPS helpers ----------

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
        } catch {
          resolve({ status, body: null, raw: data });
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs || 30000, () => { req.destroy(); reject(new Error('HTTPS timeout')); });
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
      'User-Agent': 'AubuchonLiveSalesLogger/2.0',
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
      'User-Agent': 'AubuchonLiveSalesLogger/2.0',
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    },
  }, payload);
}

function fetchLiveSales(url) {
  const u = new URL(url);
  return httpsJson({
    hostname: u.hostname,
    path: u.pathname + u.search,
    method: 'GET',
    headers: { 'User-Agent': 'AubuchonLiveSalesLogger/2.0' },
  }, null, 100000);
}

// --------- ET date helpers ----------

function etParts(d = new Date()) {
  const date = d.toLocaleString('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
  const time = d.toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit' });
  const [y, m, dd] = date.split('-').map(Number);
  let [hh, mm] = time.split(':').map(Number);
  if (hh === 24) hh = 0;
  const dowSrc = new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const dow = dowSrc.getDay();
  return {
    dateET: `${y}-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`,
    year: y, month: m, day: dd, hourET: hh, minuteET: mm, dow,
    tsET: d.toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }),
  };
}

function minutesOfDay(h, m) { return h * 60 + m; }

// --------- Baseline loading ----------

async function loadBaseline() {
  const r = await ghGet(BASELINE_PATH);
  if (r.status === 200 && r.body?.content) {
    try {
      return JSON.parse(Buffer.from(r.body.content, 'base64').toString('utf8'));
    } catch { /* fall through */ }
  }
  return null;
}

async function loadOfflineStores() {
  const r = await ghGet(OFFLINE_STORES_PATH);
  if (r.status === 200 && r.body?.content) {
    try {
      return JSON.parse(Buffer.from(r.body.content, 'base64').toString('utf8'));
    } catch { /* fall through */ }
  }
  return null;
}

// Estimate current and EOD sales for stores that don't report to the live feed.
// offlineStores is the parsed offline-stores.json. paceAtNow is the company pace curve value
// at the current time (0-1). Returns { estimatedCurrent, estimatedEOD, perStore: [...] }.
function estimateOfflineSales(offlineStores, dow, paceAtNow) {
  if (!offlineStores?.stores?.length) return null;
  const pace = Math.max(0, Math.min(1, paceAtNow || 0));
  const perStore = [];
  let totalEOD = 0;
  for (const s of offlineStores.stores) {
    const dowEOD = Number(s.dowSales?.[String(dow)] || 0);
    if (dowEOD <= 0) continue;
    const current = dowEOD * pace;
    totalEOD += dowEOD;
    perStore.push({
      storeCd: s.storeCd,
      name: s.name,
      dowEOD,
      estimatedCurrent: current,
      estimatedEOD: dowEOD,
      stdev: Number(s.dowStdev?.[String(dow)] || 0),
    });
  }
  return {
    estimatedCurrent: totalEOD * pace,
    estimatedEOD: totalEOD,
    paceUsed: pace,
    perStore,
    source: offlineStores.source || 'offline-stores.json',
  };
}

// --------- Holiday detection ----------

function nthWeekdayOfMonth(year, month, dow, n) {
  // month is 1-based. Returns the date (day-of-month) of the nth occurrence of dow in month.
  const first = new Date(Date.UTC(year, month - 1, 1));
  const firstDow = first.getUTCDay();
  const offset = ((dow - firstDow) + 7) % 7;
  return 1 + offset + (n - 1) * 7;
}

function lastWeekdayOfMonth(year, month, dow) {
  const last = new Date(Date.UTC(year, month, 0)); // last day of month
  const lastDow = last.getUTCDay();
  const offset = ((lastDow - dow) + 7) % 7;
  return last.getUTCDate() - offset;
}

function holidayKey(y, m, d, dow) {
  // m is 1-based. Returns string key matching baseline.holidayMult, or null.
  // Federal holidays
  if (m === 1 && d === 1) return 'new-years-day';
  if (m === 12 && d === 31) return 'nye';
  // MLK Day — 3rd Monday of January
  if (m === 1 && dow === 1 && d === nthWeekdayOfMonth(y, 1, 1, 3)) return 'mlk-day';
  // Presidents Day — 3rd Monday of February
  if (m === 2 && dow === 1 && d === nthWeekdayOfMonth(y, 2, 1, 3)) return 'presidents-day';
  // Memorial Day — last Monday of May
  if (m === 5) {
    const memMon = lastWeekdayOfMonth(y, 5, 1);
    if (d === memMon) return 'memorial-mon';
    if (d === memMon - 1) return 'memorial-sun';
    if (d === memMon - 2) return 'memorial-sat';
    if (d === memMon - 3) return 'memorial-fri';
  }
  // Juneteenth
  if (m === 6 && d === 19) return 'juneteenth';
  // July 3 & 4
  if (m === 7 && d === 3) return 'july-3';
  if (m === 7 && d === 4) return 'july-4';
  // Labor Day — 1st Monday of September
  if (m === 9) {
    const laborMon = nthWeekdayOfMonth(y, 9, 1, 1);
    if (d === laborMon) return 'labor-mon';
    if (d === laborMon - 1) return 'labor-sun';
    if (d === laborMon - 2) return 'labor-sat';
  }
  // Columbus Day — 2nd Monday of October
  if (m === 10 && dow === 1 && d === nthWeekdayOfMonth(y, 10, 1, 2)) return 'columbus-day';
  // Veterans Day
  if (m === 11 && d === 11) return 'veterans-day';
  // Thanksgiving — 4th Thursday of November; Black Friday, Sat, Sun
  if (m === 11) {
    const thanks = nthWeekdayOfMonth(y, 11, 4, 4);
    if (d === thanks) return 'thanksgiving';
    if (d === thanks + 1) return 'black-friday';
    if (d === thanks + 2) return 'black-saturday';
    if (d === thanks + 3) return 'black-sunday';
  }
  // December retail peaks
  if (m === 12 && d === 23) return 'dec-23';
  if (m === 12 && d === 24) return 'christmas-eve';
  if (m === 12 && d === 25) return 'christmas-day';
  if (m === 12 && d === 26) return 'day-after-christmas';
  return null;
}

function seasonForMonth(m) {
  if (m === 12 || m <= 2) return 'winter';
  if (m >= 3 && m <= 5) return 'spring';
  if (m >= 6 && m <= 8) return 'summer';
  return 'fall';
}

// --------- NOAA NWS weather fetch + classification ----------

function nwsGetJson(path) {
  return httpsJson({
    hostname: 'api.weather.gov',
    path,
    method: 'GET',
    headers: {
      'User-Agent': '(aubuchon-it-command-center, scott@aubuchon.com)',
      'Accept': 'application/geo+json',
    },
  }, null, 15000);
}

async function getStationForecast(lat, lon) {
  // Step 1: get grid point for lat/lon
  const pt = await nwsGetJson(`/points/${lat.toFixed(4)},${lon.toFixed(4)}`);
  if (pt.status !== 200 || !pt.body?.properties) return null;
  const forecastUrl = pt.body.properties.forecast;
  if (!forecastUrl) return null;
  const u = new URL(forecastUrl);
  const fc = await httpsJson({
    hostname: u.hostname, path: u.pathname + u.search, method: 'GET',
    headers: { 'User-Agent': '(aubuchon-it-command-center, scott@aubuchon.com)', 'Accept': 'application/geo+json' },
  }, null, 15000);
  if (fc.status !== 200 || !fc.body?.properties?.periods) return null;
  const periods = fc.body.properties.periods;
  // Today = first period where startTime's date matches "today" OR first period regardless.
  // For simplicity, take the first daytime period + its following night.
  const today = periods[0];
  const tonight = periods[1] || null;
  return { today, tonight };
}

function classifyWeather(forecasts, dow, season) {
  // forecasts is an array of { station, weight, today, tonight }
  // Returns { primaryKey, priorsApplied, summary }
  const isWeekend = (dow === 0 || dow === 6);
  const tags = {};
  const add = (key, w) => { tags[key] = (tags[key] || 0) + w; };

  for (const f of forecasts) {
    if (!f || !f.today) continue;
    const t = f.today;
    const name = (t.shortForecast || '').toLowerCase();
    const detailed = (t.detailedForecast || '').toLowerCase();
    const temp = Number(t.temperature || 0);
    const tempTonight = Number(f.tonight?.temperature || temp);
    const w = f.weight;

    // Snow / winter signals
    const mentionsSnow = /snow|flurr|wintry/.test(name + ' ' + detailed);
    const mentionsIce = /ice|freezing rain|sleet/.test(detailed);
    const heavySnow = /heavy snow|blizzard|\b(\d{1,2})\s*(to|-)\s*(\d{1,2})\s*inches/.test(detailed) && mentionsSnow;
    const mentionsStorm = /storm|severe|watch|warning|advisory/.test(detailed);
    const mentionsRain = /rain|shower|thunder/.test(name + ' ' + detailed);
    const heavyRain = /heavy rain|downpour|flood/.test(detailed);
    const windy = /wind|gust/.test(detailed) && /\b(30|35|40|45|50|55|60)\b\s*mph/.test(detailed);
    const sunny = /sunny|clear|mostly sunny/.test(name) && !mentionsRain;
    const isCold = temp < 20 || tempTonight < 10;
    const isHot90 = temp >= 90;
    const isHot95 = temp >= 95;
    const isPerfectSpring = season === 'spring' && temp >= 65 && temp <= 80 && !mentionsRain;
    const isSunnyWarm = season === 'spring' && temp >= 65 && sunny;
    const isSunnyCrisp = season === 'fall' && temp >= 55 && temp <= 70 && sunny;
    const isPerfectSummer = season === 'summer' && temp >= 75 && temp <= 85 && !mentionsRain;
    const isColdRain = season === 'spring' && mentionsRain && temp < 50;

    // Winter classifications
    if (season === 'winter') {
      if (mentionsStorm && mentionsSnow) add('preStorm_any', w);
      else if (heavySnow) add('heavySnow_gt_6in', w);
      else if (mentionsSnow) add('lightSnow_1to3in', w);
      else if (mentionsIce) add('iceStorm', w);
      else if (windy) add('highWind_powerOut', w);
      else if (isCold) add('coldSnap_lt_20F', w);
      else add('normal', w);
    } else if (season === 'spring') {
      if (isPerfectSpring) add('perfect_65_80F_dry', w);
      else if (isSunnyWarm) add('sunny_gt_65F', w);
      else if (isColdRain) add('coldRain_lt_50F', w);
      else if (heavyRain || (mentionsRain && isWeekend)) add('rain_weekend', w);
      else if (mentionsRain) add('rain_gt_0_5in', w);
      else add('normal', w);
    } else if (season === 'summer') {
      if (isHot95) add('hot_gt_95F', w);
      else if (isHot90) add('hot_gt_90F', w);
      else if (isPerfectSummer) add('perfect_75_85F_dry', w);
      else if (heavyRain || (mentionsRain && isWeekend)) add('rain_weekend', w);
      else if (mentionsRain) add('rain_gt_0_5in', w);
      else add('normal', w);
    } else { // fall
      if (isSunnyCrisp) add('sunny_55_70F', w);
      else if (temp < 32 && !mentionsSnow) add('firstFrost', w);
      else if (heavyRain || (mentionsRain && isWeekend)) add('rain_weekend', w);
      else if (mentionsRain) add('rain_gt_0_5in', w);
      else add('normal', w);
    }
  }

  // Pick the dominant tag (most weight). If nothing, default normal.
  let best = 'normal', bestW = 0;
  for (const [k, v] of Object.entries(tags)) {
    if (v > bestW) { best = k; bestW = v; }
  }
  return { primaryKey: best, tagWeights: tags };
}

async function getWeatherMultiplier(baseline, dow, season) {
  if (!baseline?.weatherStations || !baseline.weatherPriors) {
    return { mult: 1.0, key: 'unknown', summary: 'no baseline stations', forecasts: [] };
  }
  const stations = baseline.weatherStations; // [[name,lat,lon,weight], ...]
  const totalWeight = stations.reduce((s, [,,,w]) => s + (w || 0), 0) || 1;

  const forecasts = await Promise.all(stations.map(async ([name, lat, lon, weight]) => {
    try {
      const f = await getStationForecast(lat, lon);
      return f ? { station: name, weight: weight / totalWeight, today: f.today, tonight: f.tonight } : null;
    } catch {
      return null;
    }
  }));

  const got = forecasts.filter(Boolean);
  if (!got.length) return { mult: 1.0, key: 'nws-unavailable', summary: 'NWS fetch failed for all stations', forecasts: [] };

  const cls = classifyWeather(got, dow, season);
  const priors = baseline.weatherPriors[season] || {};
  const mult = priors[cls.primaryKey] ?? priors.normal ?? 1.0;

  const summary = got.map(f => `${f.station}: ${f.today?.temperature}${f.today?.temperatureUnit || 'F'} ${f.today?.shortForecast || ''}`).join(' | ');

  return {
    mult,
    key: cls.primaryKey,
    season,
    summary,
    tagWeights: cls.tagWeights,
    forecasts: got.map(f => ({
      station: f.station,
      weight: f.weight,
      temp: f.today?.temperature,
      unit: f.today?.temperatureUnit,
      short: f.today?.shortForecast,
      detailed: f.today?.detailedForecast,
    })),
  };
}

// --------- Pace curve projection (shape model) ----------

function paceAtTime(curve, hh, mm) {
  // curve is { "HH:MM": pct }. Find the bracket around hh:mm and linearly interp.
  if (!curve) return null;
  const keys = Object.keys(curve).sort();
  if (!keys.length) return null;
  const targetMin = hh * 60 + mm;
  let prev = null, next = null;
  for (const k of keys) {
    const [h, m] = k.split(':').map(Number);
    const km = h * 60 + m;
    if (km <= targetMin) prev = { k, km, pct: curve[k] };
    if (km >= targetMin && !next) { next = { k, km, pct: curve[k] }; break; }
  }
  if (prev && next && prev.km === next.km) return prev.pct;
  if (prev && next) {
    const t = (targetMin - prev.km) / (next.km - prev.km);
    return prev.pct + t * (next.pct - prev.pct);
  }
  if (prev) return prev.pct; // after last key — return 1
  if (next) return next.pct * (targetMin / next.km); // before first key — scale down
  return null;
}

// --------- Load observed paces from recent same-DOW history (learning layer) ----------

async function loadObservedPaces(dateET, dow, lookbackWeeks, logDir) {
  // Returns array of { dateET, pacesByMinute: Map<minuteOfDay, pct> }
  const out = [];
  const [y, m, d] = dateET.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dates = [];
  for (let i = 1; i <= lookbackWeeks; i++) {
    const t = new Date(base.getTime() - i * 7 * 24 * 60 * 60 * 1000);
    const yy = t.getUTCFullYear();
    const mm = String(t.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(t.getUTCDate()).padStart(2, '0');
    dates.push(`${yy}-${mm}-${dd}`);
  }
  const fetched = await Promise.all(dates.map(async (dstr) => {
    const r = await ghGet(`${logDir}/${dstr}.jsonl`);
    if (r.status !== 200 || !r.body?.content) return null;
    const text = Buffer.from(r.body.content, 'base64').toString('utf8');
    const rows = text.split('\n').filter(Boolean).map(ln => { try { return JSON.parse(ln); } catch { return null; } }).filter(Boolean);
    if (rows.length < 3) return null;
    const eod = Math.max(...rows.map(r => Number(r.sales || 0)));
    if (!eod || eod <= 0) return null;
    return { dateET: dstr, rows, eod };
  }));
  return fetched.filter(Boolean);
}

function observedPaceAtNow(history, hourET, minuteET) {
  // For each history day, find the row closest at/before now and compute pace = sales/eod.
  // Return { paces, eodList }.
  const targetMin = minutesOfDay(hourET, minuteET);
  const paces = [], eods = [];
  for (const h of history) {
    const rows = [...h.rows].sort((a, b) => minutesOfDay(a.hourET, a.minuteET) - minutesOfDay(b.hourET, b.minuteET));
    let at = null;
    for (const r of rows) {
      const mm = minutesOfDay(r.hourET, r.minuteET);
      if (mm <= targetMin) at = r; else break;
    }
    if (!at) continue;
    const pace = Number(at.sales || 0) / h.eod;
    if (pace > 0 && pace <= 1) { paces.push(pace); eods.push(h.eod); }
  }
  return { paces, eods };
}

// --------- Blend weight based on % of day elapsed ----------

function blendWeight(pctOfDayElapsed) {
  // Sigmoid: weight on shape (pace projection) grows from ~0 near open to ~1 near close.
  // The pace projection becomes reliable roughly after 40% of the day is done.
  // Early morning, we want to trust the level (plan × factors) model.
  const x = (pctOfDayElapsed - 0.45) * 7; // shift/steepness
  return 1 / (1 + Math.exp(-x));
}

// --------- Confidence classification ----------

function confidenceLabel(pctOfDayElapsed, observedPaceCount, hasBaseline, hasWeather) {
  const score =
    (pctOfDayElapsed > 0.6 ? 2 : pctOfDayElapsed > 0.3 ? 1 : 0) +
    (observedPaceCount >= 5 ? 2 : observedPaceCount >= 2 ? 1 : 0) +
    (hasBaseline ? 1 : 0) +
    (hasWeather ? 1 : 0);
  if (score >= 5) return 'high';
  if (score >= 3) return 'medium';
  if (score >= 1) return 'low';
  return 'very low';
}

// --------- Main prediction builder ----------

function buildPrediction({ entry, et, baseline, weather, observedHistory }) {
  const dow = et.dow;
  const plan = Number(entry.plan || 0);
  const curSales = Number(entry.sales || 0);

  // --- LEVEL MODEL ---
  const recency = baseline?.recencyFactor ?? 1.0;
  const dowRatio = baseline?.dowPlanRatio?.[String(dow)] ?? 1.0;
  const hkey = holidayKey(et.year, et.month, et.day, dow);
  const holidayMult = (hkey && baseline?.holidayMult?.[hkey]) || 1.0;
  const weatherMult = weather?.mult ?? 1.0;

  const level_EOD = plan > 0
    ? plan * recency * dowRatio * holidayMult * weatherMult
    : 0;

  // --- SHAPE MODEL (pace curve, blended with observed) ---
  const curveDow = baseline?.dowPaceCurve?.[String(dow)];
  const basePaceNow = paceAtTime(curveDow, et.hourET, et.minuteET);

  // Blend baseline pace with observed paces from last N same-DOW days if available
  const obs = observedPaceAtNow(observedHistory, et.hourET, et.minuteET);
  let pctNow = basePaceNow;
  if (obs.paces.length >= 2) {
    // Trim, then average observed; weight observed more as count grows
    const sortedP = [...obs.paces].sort((a,b)=>a-b);
    const trimmed = sortedP.length >= 4 ? sortedP.slice(1, -1) : sortedP;
    const obsAvg = trimmed.reduce((s,v)=>s+v,0) / trimmed.length;
    const obsWeight = Math.min(0.75, obs.paces.length / 8);
    if (basePaceNow != null) {
      pctNow = obsWeight * obsAvg + (1 - obsWeight) * basePaceNow;
    } else {
      pctNow = obsAvg;
    }
  }

  // Cold-start: if no baseline curve and no observed paces, fall back to linear
  let shape_EOD = null;
  let pctOfDayElapsed = null;
  if (pctNow && pctNow > 0) {
    shape_EOD = curSales / pctNow;
    pctOfDayElapsed = pctNow;
  } else {
    // Linear business-hours fallback
    const curMin = minutesOfDay(et.hourET, et.minuteET);
    const openMin = BUSINESS_OPEN_HOUR * 60;
    const closeMin = BUSINESS_CLOSE_HOUR * 60;
    const dayLen = closeMin - openMin;
    const pct = Math.max(0, Math.min(1, (curMin - openMin) / dayLen));
    pctOfDayElapsed = pct;
    if (pct > 0.05) shape_EOD = curSales / pct;
  }

  // --- BLEND ---
  const w = blendWeight(pctOfDayElapsed ?? 0);
  let projectedEOD;
  let method;
  if (level_EOD > 0 && shape_EOD != null) {
    projectedEOD = w * shape_EOD + (1 - w) * level_EOD;
    method = `blended (w=${w.toFixed(2)} shape + ${(1-w).toFixed(2)} level)`;
  } else if (level_EOD > 0) {
    projectedEOD = level_EOD;
    method = 'level only (plan × factors — early in day or no shape yet)';
  } else if (shape_EOD != null) {
    projectedEOD = shape_EOD;
    method = 'shape only (pace curve — no plan available)';
  } else {
    projectedEOD = curSales;
    method = 'current sales (insufficient data)';
  }

  // --- BAND (confidence interval) ---
  // Use the dow residual stdev from baseline. ±1 stdev ≈ 68% band.
  const dowStdev = baseline?.dowPlanStdev?.[String(dow)] ?? 0.15;
  // Residual stdev shrinks as day progresses and shape takes over
  const effectiveStdev = dowStdev * (1 - 0.5 * w);
  const band = {
    low: Math.max(0, projectedEOD * (1 - effectiveStdev)),
    high: projectedEOD * (1 + effectiveStdev),
  };

  const confidence = confidenceLabel(pctOfDayElapsed ?? 0, obs.paces.length, !!baseline, !!weather && weather.key !== 'nws-unavailable');

  return {
    available: true,
    method,
    confidence,
    projectedEOD,
    projectedPctToPlan: plan > 0 ? (projectedEOD / plan) * 100 : null,
    projectedVariance: plan > 0 ? projectedEOD - plan : null,
    band,
    pctOfDayElapsed,
    level_EOD,
    shape_EOD,
    blendWeight: w,
    factors: {
      plan,
      recencyFactor: recency,
      dowPlanRatio: dowRatio,
      holidayKey: hkey,
      holidayMult,
      weatherKey: weather?.key || null,
      weatherMult,
      weatherSummary: weather?.summary || null,
    },
    shapeDetail: {
      basePaceFromCurve: basePaceNow,
      observedPaceCount: obs.paces.length,
      blendedPaceAtNow: pctNow,
      historyDays: obs.paces.length,
      avgHistoricalEOD: obs.eods.length ? obs.eods.reduce((s,v)=>s+v,0)/obs.eods.length : null,
    },
    note: 'Plan-anchored forecast. Early in the day we trust plan × factors; later we trust the pace curve.',
  };
}

// --------- Logging ----------

async function appendLogLine(dateET, entry, logDir) {
  const path = `${logDir}/${dateET}.jsonl`;
  const existing = await ghGet(path);
  let prevText = '', sha = null;
  if (existing.status === 200 && existing.body?.content) {
    prevText = Buffer.from(existing.body.content, 'base64').toString('utf8');
    sha = existing.body.sha;
    if (prevText.length && !prevText.endsWith('\n')) prevText += '\n';
  } else if (existing.status !== 404 && existing.status !== 200) {
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

async function writePrediction(obj, logDir) {
  const path = `${logDir}/prediction.json`;
  const existing = await ghGet(path);
  const sha = existing.status === 200 ? existing.body?.sha : null;
  const b64 = Buffer.from(JSON.stringify(obj, null, 2), 'utf8').toString('base64');
  const put = await ghPut(path, b64, `chore: update live sales prediction [skip ci]`, sha);
  return put.status >= 200 && put.status < 300;
}

async function writeCurrentSnapshot(liveBody, prediction, logDir) {
  const path = `${logDir}/current.json`;
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
    // 0) Source routing. Default is yoda; pass ?source=snowflake to hit the
    //    Snowflake-backed endpoint and write into the live-sales-snowflake dir.
    //    Both sources share baseline.json and offline-stores.json.
    const sourceRaw = String((req.query && req.query.source) || 'yoda').toLowerCase();
    const source = SOURCES[sourceRaw] ? sourceRaw : 'yoda';
    const { liveSalesUrl, logDir } = SOURCES[source];

    // 1) Live sales
    const live = await fetchLiveSales(liveSalesUrl);
    if (live.status !== 200 || !live.body || live.body.status !== 'ok') {
      return res.status(502).json({ status: 'error', stage: 'fetch-live', source, liveSalesUrl, detail: live.body || live.raw });
    }
    const d = live.body;
    const ct = d.companyTotal || {};

    const now = new Date();
    const et = etParts(now);

    const entry = {
      ts: now.toISOString(),
      tsET: et.tsET,
      dateET: et.dateET,
      hourET: et.hourET, minuteET: et.minuteET, dow: et.dow,
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

    // 2) Append to log (per-source log dir)
    const appendResult = await appendLogLine(et.dateET, entry, logDir);

    // 3) Load baseline + weather + observed history + offline stores (parallel).
    //    Baseline and offline-stores are SHARED across sources (single tuning
    //    surface). Observed paces come from THIS source's log history.
    const season = seasonForMonth(et.month);
    const [baseline, observedHistory, offlineStores] = await Promise.all([
      loadBaseline(),
      loadObservedPaces(et.dateET, et.dow, 8, logDir),
      loadOfflineStores(),
    ]);
    let weather = null;
    if (baseline) {
      try {
        weather = await getWeatherMultiplier(baseline, et.dow, season);
      } catch (e) {
        weather = { mult: 1.0, key: 'error', summary: `NWS error: ${e.message}`, forecasts: [] };
      }
    }

    // 4) Build prediction (live-reporting stores only)
    const prediction = buildPrediction({ entry, et, baseline, weather, observedHistory });

    // 5) Estimate offline stores (not in live feed — e.g. Ithaca 233 & 234) and
    //    layer them on top. Uses the company pace curve at current time for the
    //    sales-so-far estimate; EOD estimate is the DOW-specific daily average.
    let offlineEstimate = null;
    if (offlineStores && prediction?.shapeDetail) {
      const paceNow = prediction.shapeDetail.blendedPaceAtNow ?? prediction.pctOfDayElapsed ?? 0;
      offlineEstimate = estimateOfflineSales(offlineStores, et.dow, paceNow);
      if (offlineEstimate) {
        // Augment the prediction with combined totals
        prediction.offlineEstimate = offlineEstimate;
        prediction.combinedProjectedEOD = prediction.projectedEOD + offlineEstimate.estimatedEOD;
        prediction.combinedCurrentSales = Number(entry.sales || 0) + offlineEstimate.estimatedCurrent;
        prediction.footnote = `Company total excludes ${offlineEstimate.perStore.