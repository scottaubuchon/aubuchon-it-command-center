// Minimal /api/yoda-2 — diagnostic. No Snowflake, no imports. Just confirms
// Vercel can deploy and invoke this route. If this crashes too, it's a
// platform-level issue, not something in my Snowflake code.
export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "no-store, max-age=0");
    const page = (req.query && req.query.page) || "summary";

    // Env-var audit (don't leak secrets — just report presence)
    const env = {
      SNOWFLAKE_ACCOUNT: !!process.env.SNOWFLAKE_ACCOUNT,
      SNOWFLAKE_USER:    !!process.env.SNOWFLAKE_USER,
      SNOWFLAKE_WAREHOUSE: !!process.env.SNOWFLAKE_WAREHOUSE,
      SNOWFLAKE_DATABASE: process.env.SNOWFLAKE_DATABASE || "(default)",
      SNOWFLAKE_SCHEMA:   process.env.SNOWFLAKE_SCHEMA   || "(default)",
      SNOWFLAKE_ROLE:     process.env.SNOWFLAKE_ROLE     || "(not set)",
      HAS_PASSWORD:    !!process.env.SNOWFLAKE_PASSWORD,
      HAS_PRIVATE_KEY: !!process.env.SNOWFLAKE_PRIVATE_KEY,
      NODE_VERSION: process.version,
    };

    res.status(200).json({
      status: "ok",
      page,
      note: "minimal diagnostic — no Snowflake calls yet",
      env,
      now: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({
      status: "error",
      error: (err && err.message) || String(err),
      stack: err && err.stack,
    });
  }
}
