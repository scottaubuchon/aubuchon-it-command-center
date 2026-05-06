// /api/snapshot — serve the latest current.json from GitHub (no CDN caching).
// raw.githubusercontent has a 5-min+ CDN cache that ignores query strings,
// so the frontend reads this endpoint instead to always get fresh data.
//
// Pass ?source=snowflake to read from public/data/live-sales-snowflake/current.json
// instead of the YODA-backed live-sales/current.json. Default is yoda for
// backwards compat.
import https from 'https';

const GH_OWNER = 'scottaubuchon';
const GH_REPO = 'aubuchon-it-command-center';
const GH_TOKEN = process.env.GITHUB_TOKEN || '';

const PATHS = {
  yoda:      'public/data/live-sales/current.json',
  snowflake: 'public/data/live-sales-snowflake/current.json',
};

function ghGet(path) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.github.com',
      path: `/repos/${GH_OWNER}/${GH_REPO}/contents/${path}`,
      headers: {
        'User-Agent': 'vercel-snapshot',
        'Accept': 'application/vnd.github.v3.raw',
        ...(GH_TOKEN ? { 'Authorization': `token ${GH_TOKEN}` } : {}),
      },
    };
    https.get(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        resolve({ status: res.statusCode, body });
      });
    }).on('error', reject);
  });
}

export const config = { maxDuration: 15 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  try {
    const sourceRaw = String((req.query && req.query.source) || 'yoda').toLowerCase();
    const source = PATHS[sourceRaw] ? sourceRaw : 'yoda';
    const gh = await ghGet(PATHS[source]);
    if (gh.status !== 200) {
      res.status(502).json({ error: 'GitHub API error', ghStatus: gh.status, source });
      return;
    }
    // gh.body is the raw JSON string (we used Accept: application/vnd.github.v3.raw)
    res.setHeader('Content-Type', 'application/json');
    res.end(gh.body);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
