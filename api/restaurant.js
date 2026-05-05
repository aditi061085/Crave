module.exports = async function handler(req, res) {
  const { place_id, name } = req.query;
  if (!place_id) return res.status(400).json({ error: "No place_id" });

  try {
    // Get place details + photos from Google
    const detailsUrl = "https://maps.googleapis.com/maps/api/place/details/json" +
      "?place_id=" + place_id +
      "&fields=name,rating,formatted_address,formatted_phone_number,opening_hours,price_level,photos,website,reviews" +
      "&key=" + process.env.GOOGLE_PLACES_API_KEY;

    const detailsRes = await fetch(detailsUrl);
    const detailsData = await detailsRes.json();
    const place = detailsData.result || {};

    // Get up to 3 photo URLs
    const photos = (place.photos || []).slice(0, 3).map(function(p) {
      return "https://maps.googleapis.com/maps/api/place/photo" +
        "?maxwidth=800" +
        "&photo_reference=" + p.photo_reference +
        "&key=" + process.env.GOOGLE_PLACES_API_KEY;
    });

    // Build AI prompt
    const reviewText = (place.reviews || []).slice(0, 3).map(function(r) {
      return r.text;
    }).join(" ");

    const prompt = "You are a food expert. Based on this restaurant info, give a helpful summary.\n\n" +
      "Restaurant: " + (place.name || name) + "\n" +
      "Address: " + (place.formatted_address || "") + "\n" +
      "Rating: " + (place.rating || "unknown") + "/5\n" +
      "Price level: " + (place.price_level ? "$".repeat(place.price_level) : "unknown") + "\n" +
      "Reviews: " + (reviewText || "No reviews available") + "\n\n" +
      "Respond with ONLY a valid JSON object:\n" +
      "{\"summary\":\"2-3 sentence description of the restaurant vibe and food\",\"popularDishes\":[\"dish1\",\"dish2\",\"dish3\"],\"bestFor\":\"One sentence about who this is perfect for\",\"tip\":\"One insider tip\"}";

    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + process.env.OPENAI_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 400,
        temperature: 0.3
      })
    });

    const aiData = await aiRes.json();
    var aiText = aiData.choices[0].message.content.trim();
    aiText = aiText.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    var aiJson = {};
    try { aiJson = JSON.parse(aiText); } catch(e) {}

    res.status(200).json({
      name: place.name || name,
      address: place.formatted_address || "",
      phone: place.formatted_phone_number || "",
      rating: place.rating || null,
      priceLevel: place.price_level ? "$".repeat(place.price_level) : "$$",
      hours: place.opening_hours ? place.opening_hours.weekday_text : [],
      isOpen: place.opening_hours ? place.opening_hours.open_now : null,
      website: place.website || "",
      photos: photos,
      summary: aiJson.summary || "",
      popularDishes: aiJson.popularDishes || [],
      bestFor: aiJson.bestFor || "",
      tip: aiJson.tip || "",
      mapsUrl: "https://www.google.com/maps/place/?q=place_id:" + place_id
    });

  } catch(e) {
    res.status(500).json({ error: e.message });
  }
};
