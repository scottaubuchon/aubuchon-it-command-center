// api/monitor-predictor.js
// Hourly Vercel cron: probes both prediction sources, opens a GitHub issue
// (deduped against any existing open one) on failure, and returns 500.
// Vercel auto-emails project owners on cron non-200, so the 500 is the
// secondary alert path even if the GitHub issue creation also fails.

const REPO = "scottaubuchon/aubuchon-it-command-center";
const ALERT_TITLE_PREFIX = "[ALERT] Predictor API";

async function probeOnce(base, src) {
  try {
    const r = await fetch(`${base}/api/prediction?source=${src}&t=${Date.now()}`, {
      headers: { "cache-control": "no-cache" },
    });
    const text = await r.text();
    if (r.status === 200) {
      try {
        const j = JSON.parse(text);
        if (j && Object.prototype.hasOwnProperty.call(j, "current")) {
          return { ok: true, status: 200 };
        }
        return { ok: false, status: 200, body: `JSON missing "current": ${text.slice(0, 400)}` };
      } catch (e) {
        return { ok: false, status: 200, body: `JSON parse error: ${e.message} | body: ${text.slice(0, 400)}` };
      }
    }
    return { ok: false, status: r.status, body: text.slice(0, 800) };
  } catch (e) {
    return { ok: false, status: 0, body: `fetch error: ${e.message}` };
  }
}

async function probe(base, src) {
  const first = await probeOnce(base, src);
  if (first.ok) return first;
  await new Promise((r) => setTimeout(r, 30_000)); // 30s retry buffer for transient blips
  return await probeOnce(base, src);
}

async function findOpenAlert(token) {
  const url = `https://api.github.com/repos/${REPO}/issues?state=open&labels=monitor&per_page=20`;
  const r = await fetch(url, {
    headers: { Authorization: `token ${token}`, Accept: "application/vnd.github+json" },
  });
  if (!r.ok) return null;
  const list = await r.json();
  return Array.isArray(list)
    ? list.find((i) => typeof i.title === "string" && i.title.startsWith(ALERT_TITLE_PREFIX))
    : null;
}

async function commentOnIssue(token, issueNumber, body) {
  return fetch(`https://api.github.com/repos/${REPO}/issues/${issueNumber}/comments`, {
    method: "POST",
    headers: {
      Authorization: `token ${token}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
    },
    body: JSON.stringify({ body }),
  });
}

async function createIssue(token, title, body) {
  return fetch(`https://api.github.com/repos/${REPO}/issues`, {
    method: "POST",
    headers: {
      Authorization: `token ${token}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
    },
    body: JSON.stringify({ title, body, labels: ["monitor", "alert"] }),
  });
}

function buildAlertBody(failures, stamp) {
  const lines = [
    "The Predictor API monitor failed two probes in a row (initial + 30s retry).",
    "",
    "**Endpoint:** https://aubuchon-it-command-center.vercel.app/api/prediction",
    `**Detected at:** ${stamp} UTC`,
    "",
    "**Failures:**",
  ];
  for (const f of failures) {
    lines.push(`- \`${f.source}\` → HTTP ${f.status}`);
    lines.push("  ```");
    lines.push(`  ${(f.body || "").replace(/```/g, "ʼʼʼ")}`);
    lines.push("  ```");
  }
  lines.push(
    "",
    "**Troubleshooting:**",
    "1. Vercel env var `GITHUB_TOKEN` likely expired. Rotate at github.com/settings/tokens, paste into Vercel → aubuchon-it-command-center → Settings → Environment Variables → `GITHUB_TOKEN`.",
    "2. After rotating, push a no-skip-ci commit to `.vercel-deploy-trigger` to force a fresh build (snapshot bot commits use `[skip ci]` and Vercel cancels them).",
    "3. If 502 with \"GitHub API error\", token is bad or repo permissions are missing.",
    "4. If 500 with parse error, `prediction.json` on GitHub is malformed — check the prediction logger.",
    "",
    "_Close this issue once the API is healthy again. The monitor will dedupe additional alerts onto this issue while it is open._"
  );
  return lines.join("\n");
}

export default async function handler(req, res) {
  const host = req.headers["x-forwarded-host"] || req.headers.host || "aubuchon-it-command-center.vercel.app";
  const base = `https://${host}`;
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");

  const [snow, yoda] = await Promise.all([probe(base, "snowflake"), probe(base, "yoda")]);
  const failures = [];
  if (!snow.ok) failures.push({ source: "snowflake", status: snow.status, body: snow.body });
  if (!yoda.ok) failures.push({ source: "yoda", status: yoda.status, body: yoda.body });

  if (failures.length === 0) {
    return res
      .status(200)
      .json({ status: "OK", timestamp: new Date().toISOString(), snowflake: snow.status, yoda: yoda.status });
  }

  // Failure path: dedupe + alert.
  let issueResult = "no GITHUB_TOKEN configured";
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    try {
      const existing = await findOpenAlert(token);
      const body = buildAlertBody(failures, stamp);
      if (existing) {
        const commentResp = await commentOnIssue(token, existing.number, body);
        const cj = await commentResp.json().catch(() => ({}));
        issueResult = commentResp.ok ? `commented on #${existing.number}: ${cj.html_url || ""}` : `comment failed ${commentResp.status}: ${cj.message || ""}`;
      } else {
        const title = `${ALERT_TITLE_PREFIX} failed (${stamp} UTC)`;
        const createResp = await createIssue(token, title, body);
        const j = await createResp.json().catch(() => ({}));
        issueResult = createResp.ok ? `created: ${j.html_url || ("#" + j.number)}` : `create failed ${createResp.status}: ${j.message || ""}`;
      }
    } catch (e) {
      issueResult = `error: ${e.message}`;
    }
  }

  // Return 500 so Vercel cron failure email also fires.
  return res.status(500).json({
    status: "FAIL",
    timestamp: new Date().toISOString(),
    failures,
    issue: issueResult,
  });
}
