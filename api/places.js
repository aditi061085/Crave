module.exports = async function handler(req, res) {
  const { lat, lng } = req.query;
  if (!lat || !lng) return res.status(400).json({ places: [] });

  const url = "https://api.foursquare.com/v3/places/search" +
    "?ll=" + lat + "," + lng +
    "&categories=13000" +
    "&radius=1000" +
    "&limit=10" +
    "&sort=DISTANCE";

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
      const distMeters = p.distance || 99999;
      const distMiles = Math.round(distMeters * 0.000621371 * 10) / 10;
      const distDisplay = distMeters < 1000
        ? distMeters + " m"
        : distMiles + " mi";
      const address = p.location
        ? (p.location.address || p.location.locality || "")
        : "";
      const placeLat = p.geocodes && p.geocodes.main ? p.geocodes.main.latitude : lat;
      const placeLng = p.geocodes && p.geocodes.main ? p.geocodes.main.longitude : lng;
      const mapsUrl = "https://www.google.com/maps?q=" + placeLat + "," + placeLng;
      return {
        name: p.name,
        address: address,
        distance: distDisplay,
        distanceMeters: distMeters,
        emoji: emojis[i % emojis.length],
        mapsUrl: mapsUrl
      };
    }).filter(function(p) {
      return p.distanceMeters <= 1000;
    });

    res.status(200).json({ places });
  } catch(e) {
    res.status(500).json({ places: [], error: e.message });
  }
};
