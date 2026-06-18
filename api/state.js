// Vercel serverless function — bridges the app to Supabase.
// The app calls GET /api/state to pull, and POST /api/state to push.
// Secrets come from Vercel environment variables (set in Step 4).

export default async function handler(req, res) {
  const URL = process.env.SUPABASE_URL;
  const KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!URL || !KEY) {
    return res.status(500).json({ error: "Missing Supabase env vars" });
  }

  const base = `${URL}/rest/v1/state`;
  const headers = {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    "Content-Type": "application/json",
  };

  try {
    // ---- PULL (read everything) ----
    if (req.method === "GET") {
      const r = await fetch(`${base}?select=key,value,rev`, { headers });
      const rows = await r.json();
      const out = {};
      for (const row of rows) {
        out[row.key] = { data: row.value, rev: row.rev };
      }
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json(out);
    }

    // ---- PUSH (save one blob, bump its revision) ----
    if (req.method === "POST") {
      let body = req.body;
      if (typeof body === "string") body = JSON.parse(body || "{}");
      const { key, value } = body || {};
      if (!key) return res.status(400).json({ error: "missing key" });

      // read current revision
      const cur = await fetch(
        `${base}?key=eq.${encodeURIComponent(key)}&select=rev`,
        { headers }
      );
      const curRows = await cur.json();
      const rev = ((curRows[0] && curRows[0].rev) || 0) + 1;

      // upsert (insert or update on the primary key)
      await fetch(base, {
        method: "POST",
        headers: { ...headers, Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify([{ key, value, rev }]),
      });

      return res.status(200).json({ rev });
    }

    return res.status(405).json({ error: "method not allowed" });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
