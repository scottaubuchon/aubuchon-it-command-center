import https from 'https';

const YODA_HOST = 'yoda-aubuchon.duckdns.org';
const YODA_PORT = 5088;
const YODA_KEY = 'aubuchon-yoda-2026';

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { dax } = req.body || {};
  if (!dax) return res.status(400).json({ error: 'Missing dax query' });

  const postData = JSON.stringify({ dax });

  return new Promise((resolve) => {
    const request = https.request({
      hostname: YODA_HOST,
      port: YODA_PORT,
      path: '/query',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': YODA_KEY,
        'Content-Length': Buffer.byteLength(postData),
      },
      rejectUnauthorized: false,
    }, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        try { res.status(200).json(JSON.parse(data)); }
        catch (e) { res.status(500).json({ error: 'Invalid response from YODA proxy' }); }
        resolve();
      });
    });

    request.on('error', (e) => {
      res.status(502).json({ error: 'YODA proxy unreachable: ' + e.message });
      resolve();
    });

    request.setTimeout(120000, () => {
      request.destroy();
      res.status(504).json({ error: 'YODA query timed out' });
      resolve();
    });

    request.write(postData);
    request.end();
  });
}
