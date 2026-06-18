// Vercel Serverless Function — route: /api/state
// Cross-device sync for the RACERS app, backed by a Supabase table.
// No npm packages: talks to Supabase's auto REST API (PostgREST) via fetch.
//
// Requires a table created with this SQL (run once in Supabase SQL Editor):
//   create table if not exists kv (
//     key text primary key,
//     rev bigint not null default 0,
//     data jsonb
//   );
//
// Set these in Vercel → Project → Settings → Environment Variables:
//   SUPABASE_URL        = https://<your-project>.supabase.co
//   SUPABASE_SECRET_KEY = your sb_secret_... (or legacy service_role) key

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const TABLE = "kv";

function headers() {
  const h = { apikey: SB_KEY, "Content-Type": "application/json" };
  // Legacy service_role keys are JWTs (start with "eyJ") and go on the Bearer
  // header. New sb_secret_ keys are NOT JWTs — apikey header only.
  if (SB_KEY && SB_KEY.startsWith("eyJ")) h["Authorization"] = "Bearer " + SB_KEY;
  return h;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!SB_URL || !SB_KEY) {
    res.status(500).json({ error: "Supabase env vars missing (SUPABASE_URL / SUPABASE_SECRET_KEY). Add them in Vercel and redeploy." });
    return;
  }
  try {
    if (req.method === "GET") {
      const r = await fetch(`${SB_URL}/rest/v1/${TABLE}?key=in.(racers_sched,racers_call)&select=key,rev,data`, { headers: headers() });
      const rows = await r.json();
      const out = { sched: null, call: null };
      if (Array.isArray(rows)) for (const row of rows) {
        const o = { rev: Number(row.rev), data: row.data };
        if (row.key === "racers_sched") out.sched = o;
        else if (row.key === "racers_call") out.call = o;
      }
      res.status(200).json(out);
      return;
    }
    if (req.method === "POST" || req.method === "PUT") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const key = body.key === "sched" ? "racers_sched" : (body.key === "call" ? "racers_call" : null);
      if (!key) { res.status(400).json({ error: "bad key" }); return; }
      const rev = Date.now(); // server-stamped revision
      const r = await fetch(`${SB_URL}/rest/v1/${TABLE}`, {
        method: "POST",
        headers: Object.assign(headers(), { Prefer: "resolution=merge-duplicates,return=minimal" }),
        body: JSON.stringify([{ key, rev, data: body.value }]),
      });
      if (!r.ok) { res.status(500).json({ error: "supabase write failed", detail: await r.text() }); return; }
      res.status(200).json({ ok: true, rev });
      return;
    }
    res.status(405).json({ error: "method not allowed" });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
