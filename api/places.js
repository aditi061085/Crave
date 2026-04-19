module.exports = async function handler(req, res) {
  const { lat, lng } = req.query;
  if (!lat || !lng) return res.status(400).json({ places: [] });

  const url = "https://maps.googleapis.com/maps/api/place/nearbysearch/json" +
    "?location=" + lat + "," + lng +
    "&radius=1000" +
    "&type=restaurant" +
    "&rankby=prominence" +
    "&key=" + process.env.GOOGLE_PLACES_API_KEY;

  try {
    const r = await fetch(url);
    const data = await r.json();
    const emojis = ["🍜","🍕","🌮","🍔","🍣","🥘","🥗","🍱","🍛","🍝"];

    const places = (data.results || []).slice(0, 5).map(function(p, i) {
      const placeLat = p.geometry.location.lat;
      const placeLng = p.geometry.location.lng;
      const mapsUrl = "https://www.google.com/maps/place/?q=place_id:" + p.place_id;
      const distMeters = getDistance(lat, lng, placeLat, placeLng);
      const distDisplay = distMeters < 1000
        ? Math.round(distMeters) + " m"
        : (Math.round(distMeters * 0.000621371 * 10) / 10) + " mi";
      return {
        name: p.name,
        address: p.vicinity || "",
        distance: distDisplay,
        emoji: emojis[i % emojis.length],
        mapsUrl: mapsUrl
      };
    }).sort(function(a, b) {
      return parseFloat(a.distance) - parseFloat(b.distance);
    });

    res.status(200).json({ places });
  } catch(e) {
    res.status(500).json({ places: [], error: e.message });
  }
};

function getDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
