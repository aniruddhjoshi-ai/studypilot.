const reply = (code, obj) => ({ statusCode: code, headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) });

async function ask(model, key, prompt, wantJson) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: wantJson ? { responseMimeType: "application/json" } : {}
    })
  });
  const d = await r.json().catch(() => ({}));
  return { status: r.status, ok: r.ok, d };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return reply(405, { error: "Use POST" });
  let b;
  try { b = JSON.parse(event.body || "{}"); } catch (e) { return reply(400, { error: "Bad request" }); }
  const prompt = String(b.prompt || "").slice(0, 8000);
  if (!prompt) return reply(400, { error: "Empty prompt" });
  const key = (process.env.GEMINI_API_KEY || "").trim();
  if (!key) return reply(500, { error: "Server is missing its API key." });

  const main = (process.env.GEMINI_MODEL || "gemini-3.1-flash-lite-preview").trim();
  const backup = (process.env.GEMINI_FALLBACK_MODEL || "gemini-2.5-flash-lite").trim();
  const models = main === backup ? [main] : [main, backup];

  let last = null;
  for (const m of models) {
    try {
      const res = await ask(m, key, prompt, b.json);
      if (res.ok) {
        const text = res.d.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
        if (text) return reply(200, { text });
      }
      last = res;
      if (res.status === 429 || res.status === 400 || res.status === 403) break;
    } catch (e) { last = { status: 0, d: {} }; }
  }
  if (last && last.status === 429) return reply(429, { error: "Rate limit reached" });
  const msg = String((last && last.d && last.d.error && last.d.error.message) || "unknown").replace(key, "[key]").slice(0, 200);
  return reply(502, { error: `AI service error ${last ? last.status : 0}: ${msg}` });
};
