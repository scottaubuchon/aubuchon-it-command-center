// ============================================================
// /api/yoda-chat  (ESM — matches project's "type": "module")
// YODA 2.0 chat backend.
//
// Flow per request:
//   1. Accept { question, store?, date?, history? }
//   2. Claude (claude-sonnet-4-6) generates SQL against
//      PRD_EDW_DB.SI_AGENTS.AUBUCHON_RETAIL_ANALYTICS.
//   3. SQL is validated (SELECT / WITH only, single statement,
//      no DDL/DML) then executed via snowflake-sdk.
//   4. Claude summarizes the result rows in plain English.
//   5. Response: { status, answer, sql, rows, columns, took_ms }
//
// Env vars required:
//   SNOWFLAKE_ACCOUNT, SNOWFLAKE_USER, SNOWFLAKE_WAREHOUSE,
//   SNOWFLAKE_PASSWORD (or SNOWFLAKE_PRIVATE_KEY), SNOWFLAKE_ROLE
//   ANTHROPIC_API_KEY
// ============================================================

process.env.HOME = "/tmp";
process.env.SF_OCSP_RESPONSE_CACHE_DIR = "/tmp";
process.env.SNOWFLAKE_LOG_LEVEL = "ERROR";

export const config = { maxDuration: 45 };

// ---------- Snowflake connection (mirrors api/yoda-2.js) ----------
let sdk = null;
async function getSdk() {
  if (sdk) return sdk;
  const mod = await import("snowflake-sdk");
  sdk = mod.default || mod;
  return sdk;
}

async function connect() {
  const s = await getSdk();
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
    const conn = s.createConnection(opts);
    conn.connect((err) => {
      if (err) return reject(err);
      resolve(conn);
    });
  });
}

function exec(conn, sqlText, tag) {
  const TIMEOUT_MS = 22000;
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      reject(new Error(`Query timeout (${TIMEOUT_MS}ms)` + (tag ? ` on ${tag}` : "")));
    }, TIMEOUT_MS);
    conn.execute({
      sqlText,
      complete: (err, _stmt, rows) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (err) return reject(new Error(`SQL error${tag ? " on " + tag : ""}: ${err.message || err}`));
        resolve(rows || []);
      },
    });
  });
}

function destroy(conn) {
  return new Promise((resolve) => {
    try { conn.destroy(() => resolve()); } catch (_) { resolve(); }
  });
}

// ---------- Helpers ----------
function yesterdayET() {
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  et.setDate(et.getDate() - 1);
  return et.toISOString().slice(0, 10);
}

function sanitizeStore(s) {
  if (!s) return "";
  return String(s).trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
}

function sanitizeDate(s) {
  if (!s) return "";
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

// Pull the SQL out of Claude's response. Claude is instructed to wrap it in
// ```sql ... ``` but we defensively accept any fenced block or bare SQL.
function extractSql(text) {
  if (!text) return "";
  const fenced = text.match(/```(?:sql)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  return text.trim();
}

// Safety gate. Allow only a single read-only statement against the semantic view
// or simple WITH/SELECT. Reject anything that looks like DDL/DML or multi-statement.
function validateSql(sql) {
  if (!sql) return "Empty SQL";
  const trimmed = sql.trim().replace(/;+\s*$/, "");
  if (!trimmed) return "Empty SQL";
  if (trimmed.includes(";")) return "Multiple statements are not allowed";
  const upper = trimmed.toUpperCase();
  if (!/^(WITH|SELECT)\b/.test(upper)) return "Only SELECT/WITH queries are allowed";
  const banned = [
    /\bINSERT\b/, /\bUPDATE\b/, /\bDELETE\b/, /\bMERGE\b/, /\bDROP\b/,
    /\bCREATE\b/, /\bALTER\b/, /\bTRUNCATE\b/, /\bGRANT\b/, /\bREVOKE\b/,
    /\bCALL\b/, /\bEXECUTE\b/, /\bUSE\b/, /\bCOPY\b/, /\bPUT\b/, /\bGET\b/,
  ];
  for (const re of banned) {
    if (re.test(upper)) return "DDL/DML statements are not allowed";
  }
  // Must reference our semantic view. This prevents querying arbitrary tables
  // the service account happens to have access to.
  if (!/AUBUCHON_RETAIL_ANALYTICS/i.test(trimmed)) {
    return "Query must reference PRD_EDW_DB.SI_AGENTS.AUBUCHON_RETAIL_ANALYTICS";
  }
  return null;
}

// Normalize rows coming back from Snowflake — dates become ISO, column order
// preserved by reading the first row's keys.
function shapeRows(rows) {
  if (!rows || !rows.length) return { columns: [], rows: [] };
  const columns = Object.keys(rows[0]);
  const out = rows.map((r) => {
    const o = {};
    for (const c of columns) {
      const v = r[c];
      if (v instanceof Date) o[c] = v.toISOString().slice(0, 10);
      else if (v === null || v === undefined) o[c] = null;
      else if (typeof v === "object") o[c] = String(v);
      else o[c] = v;
    }
    return o;
  });
  return { columns, rows: out };
}

// ---------- Claude calls ----------
const CLAUDE_MODEL = "claude-sonnet-4-6";
const ANTHROPIC_VERSION = "2023-06-01";

const SCHEMA_CARD = `
You are a SQL generator for Aubuchon Hardware's retail analytics warehouse.

You MUST output exactly one Snowflake SQL statement that queries the semantic view
\`PRD_EDW_DB.SI_AGENTS.AUBUCHON_RETAIL_ANALYTICS\` using SEMANTIC_VIEW(...) syntax.
Never query base tables directly. Never write DDL/DML.

Always add a LIMIT clause (default LIMIT 500) unless the user explicitly asks for more.

Semantic view logical tables and refs:

PRODUCT:
- product.product_key · product.product_cd (SKU identifier) · product.product_desc
- Hierarchy: product.department_nm → product.class_nm → product.sub_class_nm

TRANSACTION_LINE metrics (prefix with "transaction_line." when joining across tables):
- total_net_sales_gl · total_net_merchandise_sales · total_gross_profit
- total_cost · total_sale_qty (units) · transaction_count
- gross_margin_pct · average_sale · upt_avg
- Named filters: sales_only, exclude_returns_and_fees

TRANSACTION_DATE:
- transaction_dt · trade_year · trade_week · trade_week_of_year
- week_start_dt · week_end_dt · trade_month · trade_quarter · day_of_week

CUSTOMER:
- customer.customer_category values: Professional, Rewards, Employee, Military,
  Normal, Stock Holder, NON-PURCHASER, NCA, UNKNOWN, Missing
- Named filters: pro_customers, reward_customers, member_customers
  (IMPORTANT: Aubuchon "Member Sales" = Rewards+Military+Employee+Stock Holder
   → use the member_customers named filter), non_employee

INVENTORY_CURRENT (snapshot, no date needed):
- Metrics: inventory_current.total_on_hand · total_replacement_value
  · total_challenged_value · total_damaged_qty · sku_count
- Dims: product_cd, store_cd, discontinued_flg, velocity_cd,
  red_dot_flg, blue_dot_flg, replenishment_cd
- Named filter: in_stock (RETAIL_QTY > 0)

STORE:
- store_cd, store_nm, store_city, store_state, store_team_cd/nm,
  store_tier_num, active_flg, same_store_flg, ace_hardware_flg
- Named filters: active_stores, same_store, ace_stores

WEATHER:
- Named filters: historical_only, forecast_only

SEMANTIC_VIEW call syntax:

SELECT * FROM SEMANTIC_VIEW(
  PRD_EDW_DB.SI_AGENTS.AUBUCHON_RETAIL_ANALYTICS
  METRICS
    transaction_line.total_net_sales_gl AS net_sales,
    transaction_line.total_gross_profit AS gross_profit
  DIMENSIONS
    product.product_cd AS sku,
    product.department_nm AS department
  WHERE transaction_date.transaction_dt = '2026-04-22'
    AND product.department_nm = 'Yard Maintenance'
)
ORDER BY net_sales DESC NULLS LAST
LIMIT 500

Rules:
- Single statement. No semicolons inside. No comments.
- Date literals: 'YYYY-MM-DD'.
- For "yesterday" or "latest data" without a specific date, use the fallback date
  the caller supplies in the user message as {{REPORT_DATE}}.
- For "last year" / "LY", shift the date back 364 days (trade-week alignment).
- If the user asks for a store code, use STORE_CD as string ('001', '024', etc).
- If the question can't be answered with the semantic view, respond with
  exactly: NOSQL: <brief reason>
- Otherwise respond with ONLY the SQL wrapped in a \`\`\`sql code block. No prose.
`.trim();

async function claudeComplete({ system, messages, max_tokens }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY env var");

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: max_tokens || 1024,
      system,
      messages,
    }),
  });
  const body = await resp.text();
  if (!resp.ok) {
    throw new Error(`Anthropic API ${resp.status}: ${body.slice(0, 400)}`);
  }
  let data;
  try { data = JSON.parse(body); }
  catch { throw new Error("Anthropic returned non-JSON: " + body.slice(0, 200)); }
  const text = (data.content || [])
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n")
    .trim();
  return text;
}

async function generateSql({ question, store, date, history }) {
  const contextBits = [];
  contextBits.push(`Report date (use if user says "yesterday" or doesn't specify): ${date}`);
  if (store) contextBits.push(`Currently selected store: ${store}. Filter to this store unless the user asks for company-wide/all stores.`);
  else contextBits.push("No store selected — queries default to company-wide.");

  const priorTurns = (history || []).slice(-4).map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: String(m.content || ""),
  }));

  const messages = [
    ...priorTurns,
    {
      role: "user",
      content: `${contextBits.join("\n")}\n\nQuestion: ${question}\n\nWrite the SQL now.`,
    },
  ];

  const text = await claudeComplete({
    system: SCHEMA_CARD.replace("{{REPORT_DATE}}", date),
    messages,
    max_tokens: 900,
  });

  if (/^NOSQL\s*:/i.test(text)) {
    const reason = text.replace(/^NOSQL\s*:\s*/i, "").trim();
    return { nosql: true, reason, raw: text };
  }
  const sql = extractSql(text);
  return { nosql: false, sql, raw: text };
}

async function summarizeRows({ question, sql, shaped }) {
  const { columns, rows } = shaped;
  const preview = rows.slice(0, 40);
  const sys =
    "You are a retail analytics assistant for Aubuchon Hardware. " +
    "Summarize the SQL result in 2–4 short sentences, lead with the headline number, " +
    "and call out anything surprising. Don't restate the SQL. " +
    "Format currency as $X,XXX. Format percentages with one decimal. " +
    "If the result is empty, say so plainly and suggest one reason.";
  const userContent =
    `Question: ${question}\n\n` +
    `SQL that ran:\n\`\`\`sql\n${sql}\n\`\`\`\n\n` +
    `Columns: ${columns.join(", ")}\n` +
    `Row count: ${rows.length}\n` +
    `First ${preview.length} rows (JSON):\n${JSON.stringify(preview, null, 2)}`;
  const text = await claudeComplete({
    system: sys,
    messages: [{ role: "user", content: userContent }],
    max_tokens: 500,
  });
  return text;
}

// ---------- Handler ----------
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") {
    res.status(405).json({ status: "error", error: "POST only" });
    return;
  }

  const t0 = Date.now();

  // Body may arrive parsed or as string depending on Vercel runtime.
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const question = String(body.question || "").trim();
  const store = sanitizeStore(body.store);
  const date = sanitizeDate(body.date) || yesterdayET();
  const history = Array.isArray(body.history) ? body.history : [];

  if (!question) {
    res.status(400).json({ status: "error", error: "Missing 'question'" });
    return;
  }
  if (question.length > 1000) {
    res.status(400).json({ status: "error", error: "Question too long (max 1000 chars)" });
    return;
  }

  // Env sanity
  const missing = [];
  if (!process.env.ANTHROPIC_API_KEY) missing.push("ANTHROPIC_API_KEY");
  if (!process.env.SNOWFLAKE_ACCOUNT) missing.push("SNOWFLAKE_ACCOUNT");
  if (!process.env.SNOWFLAKE_USER) missing.push("SNOWFLAKE_USER");
  if (!process.env.SNOWFLAKE_WAREHOUSE) missing.push("SNOWFLAKE_WAREHOUSE");
  if (!process.env.SNOWFLAKE_PASSWORD && !process.env.SNOWFLAKE_PRIVATE_KEY) {
    missing.push("SNOWFLAKE_PASSWORD or SNOWFLAKE_PRIVATE_KEY");
  }
  if (missing.length) {
    res.status(500).json({ status: "error", error: "Missing env vars: " + missing.join(", ") });
    return;
  }

  let conn = null;
  try {
    // 1. Generate SQL
    const gen = await generateSql({ question, store, date, history });
    if (gen.nosql) {
      res.status(200).json({
        status: "ok",
        kind: "nosql",
        answer: gen.reason || "I can't answer that from the retail analytics data.",
        sql: null,
        rows: [],
        columns: [],
        took_ms: Date.now() - t0,
      });
      return;
    }
    const sql = gen.sql;
    const validationErr = validateSql(sql);
    if (validationErr) {
      res.status(200).json({
        status: "ok",
        kind: "blocked",
        answer: `I generated a query that failed the safety check (${validationErr}). Try rephrasing the question.`,
        sql,
        rows: [],
        columns: [],
        took_ms: Date.now() - t0,
      });
      return;
    }

    // 2. Run the SQL
    conn = await Promise.race([
      connect(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Snowflake connect timeout (15s) — warehouse may be resuming from suspend")), 15000)),
    ]);
    const rawRows = await exec(conn, sql, "chat-query");
    const shaped = shapeRows(rawRows);

    // 3. Summarize
    let answer;
    try {
      answer = await summarizeRows({ question, sql, shaped });
    } catch (e) {
      // Fall back to a deterministic summary rather than failing the whole request.
      answer = `Ran the query and got ${shaped.rows.length} row(s). (Summarization skipped: ${String(e.message || e)})`;
    }

    res.status(200).json({
      status: "ok",
      kind: "answer",
      answer,
      sql,
      columns: shaped.columns,
      rows: shaped.rows.slice(0, 500),
      row_count: shaped.rows.length,
      took_ms: Date.now() - t0,
    });
  } catch (e) {
    res.status(500).json({
      status: "error",
      error: String(e && e.message ? e.message : e),
      took_ms: Date.now() - t0,
    });
  } finally {
    if (conn) await destroy(conn);
  }
}
