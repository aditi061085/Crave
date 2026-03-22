const rateLimit = new Map();

function checkRateLimit(ip) {
  var now = Date.now();
  var windowMs = 60 * 1000;
  var maxRequests = 5;
  if (!rateLimit.has(ip)) { rateLimit.set(ip, { count: 1, start: now }); return true; }
  var data = rateLimit.get(ip);
  if (now - data.start > windowMs) { rateLimit.set(ip, { count: 1, start: now }); return true; }
  if (data.count >= maxRequests) return false;
  data.count++;
  return true;
}

function verifyFirebaseToken(token) {
  try {
    var parts = token.split(".");
    if (parts.length !== 3) return false;
    var payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
    var now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return false;
    if (payload.iat && payload.iat > now + 60) return false;
    if (!payload.sub || !payload.user_id) return false;
    return true;
  } catch(e) {
    return false;
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  var ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: "Too many requests. Please wait a minute and try again." });
  }

  var authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Not authorized. Please sign in to use Crave." });
  }

  var token = authHeader.split("Bearer ")[1];
  if (!verifyFirebaseToken(token)) {
    return res.status(401).json({ error: "Invalid session. Please sign out and sign back in." });
  }

  const { craving, hunger, budget, places, image, lat, lng } = req.body;

  var menuContext = image
    ? "The user has uploaded a photo of a menu. Carefully read ALL visible dish names and prices from the image. Only recommend dishes that are clearly visible on this menu."
    : "No menu photo was provided. Give general recommendations based on the craving.";

  var prompt = "You are a food recommendation AI for an app called Crave.\n\n" +
    menuContext + "\n\n" +
    "User details:\n" +
    "- Craving: " + craving + "\n" +
    "- Hunger level: " + hunger + " out of 10\n" +
    "- Budget: under $" + budget + "\n" +
    "- Location context: " + (places && places.length > 0 ? places.join(", ") : "not specified") + "\n\n" +
    "Instructions:\n" +
    "1. If a menu photo is provided, ONLY recommend dishes that appear on it\n" +
    "2. Match dishes to the craving and hunger level\n" +
    "3. Only include dishes under the budget\n" +
    "4. Be specific — use the actual dish name from the menu\n\n" +
    "You MUST respond with ONLY a valid JSON object. No markdown, no code blocks, no explanation. Just raw JSON.\n\n" +
    "Required format:\n" +
    "{\"top\":{\"name\":\"Dish name\",\"reason\":\"2-3 sentences why this is perfect\",\"tags\":[\"Tag1\",\"Tag2\",\"Tag3\"]},\"others\":[{\"emoji\":\"🍜\",\"name\":\"Dish name\",\"reason\":\"Short reason\",\"price\":\"$14\",\"match\":\"91%\"},{\"emoji\":\"🥗\",\"name\":\"Dish name\",\"reason\":\"Short reason\",\"price\":\"$11\",\"match\":\"85%\"}],\"nearbyPlaces\":[{\"emoji\":\"🍕\",\"name\":\"Place name\",\"meta\":\"0.3 mi · Open · $$\",\"mapsUrl\":\"https://maps.google.com/?q=Place+Name\"}]}";

  var messages = [
    {
      role: "user",
      content: image
        ? [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: "data:image/jpeg;base64," + image, detail: "high" } }
          ]
        : prompt
    }
  ];

  try {
    var response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + process.env.OPENAI_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: messages,
        max_tokens: 1000,
        temperature: 0.3
      })
    });

    var data = await response.json();

    if (!response.ok) {
      return res.status(500).json({ error: "OpenAI error: " + (data.error && data.error.message ? data.error.message : "Unknown error") });
    }

    var text = data.choices[0].message.content.trim();
    text = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();

    var jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ error: "Could not read the menu clearly. Try a clearer photo with better lighting." });
    }

    var parsed;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch(parseErr) {
      return res.status(500).json({ error: "Could not read the menu clearly. Try a clearer photo with better lighting." });
    }

    res.status(200).json(parsed);
  } catch(e) {
    res.status(500).json({ error: "Server error: " + e.message });
  }
}
