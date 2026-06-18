// Vercel Serverless Function - route: /api/state
// Connects to Supabase PostgreSQL using standard fetch

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

async function supabaseQuery(method, id, data = null) {
  const url = `${SUPABASE_URL}/rest/v1/racers_state?id=eq.${id}`;
  const headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    "Prefer": "return=representation"
  };

  if (method === "GET") {
    const r = await fetch(url, { method: "GET", headers });
    const res = await r.json();
    return res[0]?.data ? JSON.stringify(res[0].data) : null;
  }

  if (method === "PATCH") {
    const r = await fetch(url, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ data })
    });
    return await r.json();
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: "Supabase env vars missing (SUPABASE_URL / SUPABASE_ANON_KEY)" });
  }

  try {
    if (req.method === "GET") {
      const [s, c] = await Promise.all([
        supabaseQuery("GET", "racers_sched"),
        supabaseQuery("GET", "racers_call")
      ]);
      return res.status(200).json({ 
        sched: s ? JSON.parse(s) : null, 
        call: c ? JSON.parse(c) : null 
      });
    }

    if (req.method === "POST" || req.method === "PUT") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body;
      const key = body.key === "sched" ? "racers_sched" : (body.key === "call" ? "racers_call" : null);
      
      if (!key) return res.status(400).json({ error: "bad key" });

      await supabaseQuery("PATCH", key, body.value);
      return res.status(200).json({ ok: true, rev: Date.now() });
    }

    return res.status(405).json({ error: "method not allowed" });
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message || e) });
  }
}
