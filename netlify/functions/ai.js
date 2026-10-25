const reply = (code, obj) => ({ statusCode: code, headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) });

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return reply(405, { error: "Use POST" });
  let b;
  try { b = JSON.parse(event.body || "{}"); } catch (e) { return reply(400, { error: "Bad request" }); }
  const prompt = String(b.prompt || "").slice(0, 8000);
  if (!prompt) return reply(400, { error: "Empty prompt" });
  const key = (process.env.GEMINI_API_KEY || "").trim();
  if (!key) return reply(500, { error: "Server is missing its API key." });

  const model = (process.env.GEMINI_MODEL || "gemini-2.5-flash").trim();
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: b.json ? { responseMimeType: "application/json" } : {}
      })
    });
    const d = await r.json().catch(() => ({}));
    if (r.status === 429) return reply(429, { error: "Rate limit reached" });
    if (!r.ok) {
      const msg = String((d.error && d.error.message) || "unknown").replace(key, "[key]").slice(0, 200);
      return reply(502, { error: `AI service error ${r.status}: ${msg}` });
    }
    const text = d.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
    if (!text) return reply(502, { error: "Empty answer, try again." });
    return reply(200, { text });
  } catch (e) {
    return reply(502, { error: "Could not reach the AI service." });
  }
};
