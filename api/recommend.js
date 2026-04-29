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
    if (!payload.sub && !payload.user_id) return false;
    return true;
  } catch(e) {
    return false;
  }
}

async function getRealNearbyPlaces(lat, lng) {
  if (!lat || !lng) return [];
  try {
    const url = "https://maps.googleapis.com/maps/api/place/nearbysearch/json" +
      "?location=" + lat + "," + lng +
      "&radius=48000" +
      "&type=restaurant" +
      "&rankby=prominence" +
      "&key=" + process.env.GOOGLE_PLACES_API_KEY;
    const r = await fetch(url);
    const data = await r.json();
    const emojis = ["🍜","🍕","🌮","🍔","🍣","🥘","🥗","🍱","🍛","🍝"];
    return (data.results || []).slice(0, 3).map(function(p, i) {
      const placeLat = p.geometry.location.lat;
      const placeLng = p.geometry.location.lng;
      const mapsUrl = "https://www.google.com/maps/place/?q=place_id:" + p.place_id;
      const priceLevel = p.price_level ? "$".repeat(p.price_level) : "$$";
      const isOpen = p.opening_hours && p.opening_hours.open_now ? "Open" : "Check hours";
      return {
        emoji: emojis[i % emojis.length],
        name: p.name,
        meta: (p.vicinity || "") + " · " + isOpen + " · " + priceLevel,
        mapsUrl: mapsUrl
      };
    });
  } catch(e) {
    return [];
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

  const { craving, hunger, budget, places, image, lat, lng, allergies, hasImage } = req.body;

  var allergyText = allergies && allergies.length > 0
    ? "The user is allergic to or cannot eat: " + allergies.join(", ") + ". Do NOT recommend any dishes containing these ingredients."
    : "No allergies or restrictions.";

  var menuContext = image
    ? "The user has uploaded a photo of a menu. Carefully read ALL visible dish names and prices from the image. Only recommend dishes that are clearly visible on this menu."
    : "No menu photo was provided. Give general recommendations based on the craving.";

  var prompt = "You are a food recommendation AI for an app called Crave.\n\n" +
    menuContext + "\n\n" +
    "User details:\n" +
    "- Craving: " + craving + "\n" +
    "- Hunger level: " + hunger + " out of 10\n" +
    "- Budget: under $" + budget + "\n" +
    "- Location context: " + (places && places.length > 0 ? places.join(", ") : "not specified") + "\n" +
    "- Allergies: " + allergyText + "\n\n" +
    "Instructions:\n" +
    "1. If a menu photo is provided, ONLY recommend dishes that appear on it\n" +
    "2. Match dishes to the craving and hunger level\n" +
    "3. Only include dishes under the budget\n" +
    "4. Never recommend dishes containing allergens listed above\n" +
    "5. Be specific — use the actual dish name from the menu\n\n" +
    "You MUST respond with ONLY a valid JSON object. No markdown, no code blocks, no explanation. Just raw JSON.\n\n" +
    "Required format:\n" +
    "{\"top\":{\"name\":\"Dish name\",\"reason\":\"2-3 sentences why this is perfect\",\"tags\":[\"Tag1\",\"Tag2\",\"Tag3\"]},\"others\":[{\"emoji\":\"🍜\",\"name\":\"Dish name\",\"reason\":\"Short reason\",\"price\":\"$14\",\"match\":\"91%\"},{\"emoji\":\"🥗\",\"name\":\"Dish name\",\"reason\":\"Short reason\",\"price\":\"$11\",\"match\":\"85%\"}]}";

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
    var [response, nearbyPlaces] = await Promise.all([
      fetch("https://api.openai.com/v1/chat/completions", {
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
      }),
      getRealNearbyPlaces(lat, lng)
    ]);

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

    parsed.nearbyPlaces = nearbyPlaces;

    res.status(200).json(parsed);
  } catch(e) {
    res.status(500).json({ error: "Server error: " + e.message });
  }
}
