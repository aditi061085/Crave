export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { craving, hunger, budget, places, image, lat, lng } = req.body;

  const messages = [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `You are a food recommendation AI for an app called Crave.
The user is at a restaurant. Here is their situation:
- Craving: ${craving}
- Hunger level: ${hunger}/10
- Budget: under $${budget}
- Selected nearby places: ${places && places.length > 0 ? places.join(", ") : "just this restaurant"}

${image ? "I am attaching a photo of the menu. Read the actual dishes listed." : "No menu photo was provided."}

Based on this, respond ONLY with valid JSON in this exact format:
{
  "top": {
    "name": "Dish name",
    "reason": "2-3 sentence explanation of why this is perfect for them",
    "tags": ["Tag1", "Tag2", "Tag3"]
  },
  "others": [
    { "emoji": "🍜", "name": "Dish name", "reason": "Short reason", "price": "$14", "match": "91%" },
    { "emoji": "🥗", "name": "Dish name", "reason": "Short reason", "price": "$11", "match": "85%" }
  ],
  "nearbyPlaces": [
    { "emoji": "🍕", "name": "Place name", "meta": "0.3 mi · Open · $$", "mapsUrl": "https://maps.google.com/?q=Place+Name" }
  ]
}

If there is a menu photo, recommend ONLY dishes that actually appear on that menu. If no photo, give general recommendations based on the craving.`
        },
        ...(image ? [{
          type: "image_url",
          image_url: { url: "data:image/jpeg;base64," + image }
        }] : [])
      ]
    }
  ];

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + process.env.OPENAI_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: messages,
        max_tokens: 800
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(500).json({ error: "OpenAI error: " + (data.error && data.error.message ? data.error.message : "Unknown error") });
    }

    const text = data.choices[0].message.content;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: "Could not parse AI response" });
    const parsed = JSON.parse(jsonMatch[0]);
    res.status(200).json(parsed);
  } catch (e) {
    res.status(500).json({ error: "Server error: " + e.message });
  }
}