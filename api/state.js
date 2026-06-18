// Vercel Serverless Function — route: /api/state
// Cross-device sync for the RACERS app, backed by Upstash Redis (Vercel
// Marketplace → Redis). No npm packages: talks to Upstash over its REST API.
// Env vars are injected by the integration; we accept either naming.

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function cmd(args) {
  const r = await fetch(REDIS_URL, {
    method: "POST",
    headers: { Authorization: "Bearer " + REDIS_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const j = await r.json();
  return j.result; // string for GET, "OK" for SET, null if missing
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!REDIS_URL || !REDIS_TOKEN) {
    res.status(500).json({ error: "Redis env vars missing (KV_REST_API_URL / KV_REST_API_TOKEN). Connect a Redis store and redeploy." });
    return;
  }
  try {
    if (req.method === "GET") {
      const [s, c] = await Promise.all([cmd(["GET", "racers_sched"]), cmd(["GET", "racers_call"])]);
      res.status(200).json({ sched: s ? JSON.parse(s) : null, call: c ? JSON.parse(c) : null });
      return;
    }
    if (req.method === "POST" || req.method === "PUT") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const key = body.key === "sched" ? "racers_sched" : (body.key === "call" ? "racers_call" : null);
      if (!key) { res.status(400).json({ error: "bad key" }); return; }
      const rev = Date.now(); // server-stamped revision
      await cmd(["SET", key, JSON.stringify({ rev, data: body.value })]);
      res.status(200).json({ ok: true, rev });
      return;
    }
    res.status(405).json({ error: "method not allowed" });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
