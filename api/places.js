module.exports = async function handler(req, res) {
  const { lat, lng } = req.query;
  if (!lat || !lng) return res.status(400).json({ places: [] });

  const url = "https://api.foursquare.com/v3/places/search" +
    "?ll=" + lat + "," + lng +
    "&categories=13000" +
    "&radius=800" +
    "&limit=5";

  try {
    const r = await fetch(url, {
      headers: {
        "Authorization": process.env.FOURSQUARE_API_KEY,
        "Accept": "application/json"
      }
    });

    const data = await r.json();
    const emojis = ["🍜","🍕","🌮","🍔","🍣","🥘","🥗","🍱","🍛","🍝"];

    const places = (data.results || []).map(function(p, i) {
      const dist = p.distance
        ? (Math.round(p.distance * 0.000621371 * 10) / 10) + " mi"
        : "";
      const address = p.location
        ? (p.location.address || p.location.locality || "")
        : "";
      return {
        name: p.name,
        address: address,
        distance: dist,
        emoji: emojis[i % emojis.length],
        mapsUrl: "https://maps.google.com/?q=" + encodeURIComponent(p.name + " " + address)
      };
    });

    res.status(200).json({ places });
  } catch(e) {
    res.status(500).json({ places: [] });
  }
}
