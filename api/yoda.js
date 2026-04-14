import https from 'https';

const YODA_HOST = 'yoda-aubuchon.duckdns.org';
const YODA_PORT = 5088;
const YODA_KEY = 'aubuchon-yoda-2026';

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { dax, batch } = req.body || {};

  // Batch mode: { batch: ["dax1", "dax2", ...] }
  if (batch && Array.isArray(batch)) {
    const results = [];
    for (const q of batch) {
      try { results.push(await queryYoda(q)); }
      catch (e) { results.push({ status: 'error', error: e.message }); }
    }
    return res.status(200).json({ results });
  }

  // Single mode: { dax: "..." }
  if (!dax) return res.status(400).json({ error: 'Missing dax query' });
  try {
    const data = await queryYoda(dax);
    res.status(200).json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}
