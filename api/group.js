module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  var authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Not authorized." });
  }

  var token = authHeader.split("Bearer ")[1];
  try {
    var parts = token.split(".");
    if (parts.length !== 3) return res.status(401).json({ error: "Invalid session." });
    var payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
    var now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return res.status(401).json({ error: "Session expired. Please sign in again." });
    if (!payload.sub && !payload.user_id) return res.status(401).json({ error: "Invalid session." });
  } catch(e) {
    return res.status(401).json({ error: "Could not verify session." });
  }

  var members = req.body.members;
  if (!members || members.length === 0) {
    return res.status(400).json({ error: "No members provided." });
  }

  var prompt = "You are a group food recommendation AI for an app called Crave.\n\n" +
    "Here are the cravings from everyone in the group:\n" +
    members.join("\n") +
    "\n\nFind the single best dish and restaurant type that satisfies everyone as a compromise. " +
    "You MUST respond with ONLY valid JSON, no markdown, no code blocks. Just raw JSON.\n\n" +
    "Required format:\n" +
    "{\"top\":{\"name\":\"Dish name\",\"reason\":\"2-3 sentences why this works for the whole group\",\"tags\":[\"Tag1\",\"Tag2\",\"Tag3\"]}," +
    "\"restaurant\":{\"name\":\"Type of restaurant\",\"reason\":\"Why this works for the group\",\"mapsUrl\":\"https://maps.google.com/?q=restaurant+near+me\"}}";

  try {
    var response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + process.env.OPENAI_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 500,
        temperature: 0.3
      })
    });

    var data = await response.json();
    if (!response.ok) {
      return res.status(500).json({ error: "OpenAI error: " + (data.error ? data.error.message : "Unknown") });
    }

    var text = data.choices[0].message.content.trim();
    text = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    var jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: "Could not parse AI response" });
    res.status(200).json(JSON.parse(jsonMatch[0]));
  } catch(e) {
    res.status(500).json({ error: "Server error: " + e.message });
  }
}
