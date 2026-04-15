import https from 'https';

const YODA_HOST = 'yoda-aubuchon.duckdns.org';
const YODA_PORT = 5088;
const YODA_KEY = 'aubuchon-yoda-2026';
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// Module-level cache — persists across requests within the same Vercel instance
let cache = { data: null, timestamp: 0 };

function queryYoda(dax) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ dax });
    const request = https.request({
      hostname: YODA_HOST, port: YODA_PORT, path: '/query', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': YODA_KEY, 'Content-Length': Buffer.byteLength(postData) },
      rejectUnauthorized: false,
    }, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Invalid YODA response')); }
      });
    });
    request.on('error', reject);
    request.setTimeout(55000, () => { request.destroy(); reject(new Error('YODA query timed out')); });
    request.write(postData);
    request.end();
  });
}

async function refreshData() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();

  const liveStoreQuery = `EVALUATE SELECTCOLUMNS(FCT_LIVE_SALE, "Store", FCT_LIVE_SALE[STORE_CD], "Sales", FCT_LIVE_SALE[NET_SALES], "Txns", FCT_LIVE_SALE[TRANSACTION_CNT], "COGS", FCT_LIVE_SALE[COST_OF_GOODS], "Customers", FCT_LIVE_SALE[CUSTOMER_CNT], "Updated", FCT_LIVE_SALE[LAST_UPDATED_TS])`;

  const planQuery = `EVALUATE FILTER(SELECTCOLUMNS(RPT_SCORECARD_BY_DAY, "Loc", RPT_SCORECARD_BY_DAY[LOCATION_CD], "Date", RPT_SCORECARD_BY_DAY[SCORECARD_DT], "Plan", RPT_SCORECARD_BY_DAY[TARGET_DAILY_SALES_AMT]), [Date] = DATE(${y}, ${m}, ${d}))`;

  const dimQuery = `EVALUATE SELECTCOLUMNS(DIM_STORE, "Code", DIM_STORE[STORE_CD], "Name", DIM_STORE[STORE_NM], "City", DIM_STORE[STORE_CITY_NM], "State", DIM_STORE[STORE_STATE_CD])`;

  const productQuery = `EVALUATE TOPN(20, SUMMARIZE(FCT_LIVE_SALE_TRANSACTION_LINE, FCT_LIVE_SALE_TRANSACTION_LINE[PRODUCT_DESC], "Sales", SUM(FCT_LIVE_SALE_TRANSACTION_LINE[ITEM_EXTENDED_AMT])), [Sales], DESC)`;

  // Run queries sequentially (single connection per query, avoids parallel timeout)
  const liveResult = await queryYoda(liveStoreQuery);
  const planResult = await queryYoda(planQuery);
  const dimResult = await queryYoda(dimQuery);
  const productResult = await queryYoda(productQuery);

  // Extract rows from each result
  const liveRows = (liveResult && liveResult.rows) || [];
  const planRows = (planResult && planResult.rows) || [];
  const dimRows = (dimResult && dimResult.rows) || [];
  const productRows = (productResult && productResult.rows) || [];

  // Build name map from DIM_STORE
  const nameMap = {};
  dimRows.forEach(r => {
    const code = String(r.Code || '').replace(/^0+/, '');
    nameMap[code] = { name: r.Name || '', city: r.City || '', state: r.State || '' };
  });

  // Build plan map from RPT_SCORECARD_BY_DAY
  const planMap = {};
  planRows.forEach(r => {
    const loc = String(r.Loc || '');
    planMap[loc] = Number(r.Plan || 0);
  });

  // Compute company totals
  let totalSales = 0, totalCOGS = 0, totalTxns = 0, totalCustomers = 0, totalPlan = 0;
  let latestUpdate = '';

  liveRows.forEach(r => {
    totalSales += Number(r.Sales || 0);
    totalCOGS += Number(r.COGS || 0);
    totalTxns += Number(r.Txns || 0);
    totalCustomers += Number(r.Customers || 0);
    const storeCode = String(r.Store || '');
    totalPlan += Number(planMap[storeCode] || 0);
    if (r.Updated && r.Updated > latestUpdate) latestUpdate = r.Updated;
  });

  const companyTotal = {
    sales: totalSales,
    plan: totalPlan,
    gp: totalSales - totalCOGS,
    gpPct: totalSales > 0 ? ((totalSales - totalCOGS) / totalSales * 100) : 0,
    txns: totalTxns,
    customers: totalCustomers,
    storeCount: liveRows.length,
    pctToPlan: totalPlan > 0 ? (totalSales / totalPlan * 100) : 0,
  };

  // Top 20 stores by sales
  const storesSorted = [...liveRows]
    .sort((a, b) => Number(b.Sales || 0) - Number(a.Sales || 0))
    .slice(0, 20);

  const topStores = storesSorted.map(r => {
    const code = String(r.Store || '');
    const info = nameMap[code] || {};
    const sales = Number(r.Sales || 0);
    const cogs = Number(r.COGS || 0);
    const plan = Number(planMap[code] || 0);
    return {
      store: code,
      name: info.name || '',
      city: info.city || '',
      state: info.state || '',
      sales,
      plan,
      pctToPlan: plan > 0 ? (sales / plan * 100) : 0,
      gp: sales - cogs,
      gpPct: sales > 0 ? ((sales - cogs) / sales * 100) : 0,
      txns: Number(r.Txns || 0),
      customers: Number(r.Customers || 0),
    };
  });

  // Top 20 products by dollar sales
  const topProducts = productRows.map(r => {
    // Key comes back as FCT_LIVE_SALE_TRANSACTION_LINE[PRODUCT_DESC (missing bracket)
    const desc = r['FCT_LIVE_SALE_TRANSACTION_LINE[PRODUCT_DESC'] || r['PRODUCT_DESC'] || r['FCT_LIVE_SALE_TRANSACTION_LINE[PRODUCT_DESC]'] || Object.values(r).find(v => typeof v === 'string') || 'Unknown';
    const sales = Number(r.Sales || r['[Sales]'] || 0);
    return { product: desc, sales };
  }).sort((a, b) => b.sales - a.sales).slice(0, 20);

  return {
    companyTotal,
    topStores,
    topProducts,
    asOf: latestUpdate || new Date().toISOString(),
    refreshedAt: new Date().toISOString(),
    storeCount: liveRows.length,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const now = Date.now();
  const forceRefresh = req.query && req.query.refresh === 'true';

  // Return cached data if fresh
  if (cache.data && !forceRefresh && (now - cache.timestamp) < CACHE_TTL) {
    return res.status(200).json({ status: 'ok', cached: true, ...cache.data });
  }

  try {
    const data = await refreshData();
    cache = { data, timestamp: now };
    return res.status(200).json({ status: 'ok', cached: false, ...data });
  } catch (e) {
    // If refresh fails but we have stale cache, return it
    if (cache.data) {
      return res.status(200).json({ status: 'ok', cached: true, stale: true, ...cache.data });
    }
    return res.status(502).json({ status: 'error', error: e.message });
  }
}
