// /api/prediction?source=yoda|snowflake — serve the latest prediction.json
// from GitHub (no CDN caching). The logger writes prediction.json via GitHub
// Contents API with [skip ci], so those commits don't trigger Vercel redeploys
// and the file baked into the build gets stale. Read it live instead.
import https from 'https';

const GH_OWNER = 'scottaubuchon';
const GH_REPO = 'aubuchon-it-command-center';
const GH_TOKEN = process.env.GITHUB_TOKEN || '';

const PATHS = {
  yoda:      'public/data/live-sales/prediction.json',
  snowflake: 'public/data/live-sales-snowflake/prediction.json',
};

function ghGet(path) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.github.com',
      path: `/repos/${GH_OWNER}/${GH_REPO}/contents/${path}`,
      headers: {
        'User-Agent': 'vercel-prediction',
        'Accept': 'application/vnd.github.v3.raw',
        ...(GH_TOKEN ? { 'Authorization': `token ${GH_TOKEN}` } : {}),
      },
    };
    https.get(opts, (r) => {
      const chunks = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => resolve({ status: r.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
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
    res.setHeader('Content-Type', 'application/json');
    res.end(gh.body);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
