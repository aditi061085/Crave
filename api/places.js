export default async function handler(req, res) {
  const { lat, lng } = req.query;
  if (!lat || !lng) return res.status(400).json({ places: [] });

  const url = "https://maps.googleapis.com/maps/api/place/nearbysearch/json" +
    "?location=" + lat + "," + lng +
    "&radius=800" +
    "&type=restaurant" +
    "&key=" + process.env.GOOGLE_PLACES_API_KEY;

  try {
    const r = await fetch(url);
    const data = await r.json();

    const emojis = ["🍜","🍕","🌮","🍔","🍣","🥘","🥗","🍱","🍛","🍝"];

    const places = (data.results || []).slice(0, 5).map(function(p, i) {
      const dist = p.geometry && p.geometry.location
        ? (Math.round(getDistance(parseFloat(lat), parseFloat(lng), p.geometry.location.lat, p.geometry.location.lng) * 10) / 10) + " mi"
        : "";
      return {
        name: p.name,
        address: p.vicinity || "",
        distance: dist,
        emoji: emojis[i % emojis.length],
        rating: p.rating || "",
        mapsUrl: "https://maps.google.com/?q=" + encodeURIComponent(p.name + " " + (p.vicinity || ""))
      };
    });

    res.status(200).json({ places });
  } catch (e) {
    res.status(500).json({ places: [] });
  }
}

function getDistance(lat1, lng1, lat2, lng2) {
  var R = 3958.8;
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLng = (lng2 - lng1) * Math.PI / 180;
  var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
```

---

## How to put it online — step by step

**1. Get your API keys (free tiers available)**
- OpenAI key → platform.openai.com → API Keys
- Google Places key → console.cloud.google.com → Enable "Places API"

**2. Create the project on Vercel**
- Go to vercel.com → sign up free
- Click "Add New Project" → choose "Import from GitHub" OR just drag and drop your folder

**3. Your folder structure should look like this**
```
crave/
  index.html
  api/
    recommend.js
    places.js