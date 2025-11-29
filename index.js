const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// Distance calc
function distanceMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Multiple Overpass servers to avoid rate limits
const OVERPASS_SERVERS = [
  "https://overpass-api.de/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
  "https://z.overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
];

// Try each server until one works
async function fetchOverpass(query) {
  for (const url of OVERPASS_SERVERS) {
    try {
      console.log("Trying Overpass server:", url);

      const response = await axios.post(url, query, {
        headers: { "Content-Type": "text/plain" },
        timeout: 25000
      });

      // Some failing servers return HTML instead of JSON → skip them
      if (typeof response.data === "string" && response.data.includes("<html")) {
        console.log("Bad response (HTML), skipping:", url);
        continue;
      }

      console.log("Using Overpass server:", url);
      return response.data;
    } catch (err) {
      console.log("Overpass failed:", url);
      continue;
    }
  }

  throw new Error("All Overpass servers failed");
}

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/deals/nearby", async (req, res) => {
  try {
    const { lat, lon, radius = 20, category } = req.query;

    if (!lat || !lon) {
      return res
        .status(400)
        .json({ error: "lat and lon are required query params" });
    }

    const userLat = parseFloat(lat);
    const userLon = parseFloat(lon);
    const radiusMiles = Number(radius) || 20;
    const radiusMeters = Math.round(radiusMiles * 1609.34);

    // Category filters
    let overpassFilter;
    switch ((category || "").toLowerCase()) {
      case "food":
        overpassFilter =
          'node(around:RADIUS,USER_LAT,USER_LON)["amenity"~"restaurant|fast_food|cafe|bar|pub"];';
        break;

      case "gas":
        overpassFilter =
          'node(around:RADIUS,USER_LAT,USER_LON)["amenity"="fuel"];';
        break;

      case "groceries":
        overpassFilter =
          'node(around:RADIUS,USER_LAT,USER_LON)["shop"~"supermarket|convenience"];';
        break;

      default:
        overpassFilter = `
          node(around:RADIUS,USER_LAT,USER_LON)["shop"];
          node(around:RADIUS,USER_LAT,USER_LON)["amenity"];
        `;
        break;
    }

    // Build Overpass query
    let query = `
      [out:json][timeout:30];
      (
        ${overpassFilter}
      );
      out center 60;
    `
      .replace(/RADIUS/g, radiusMeters)
      .replace(/USER_LAT/g, userLat)
      .replace(/USER_LON/g, userLon);

    // Call Overpass (fallback automatically)
    const data = await fetchOverpass(query);
    const elements = data.elements || [];

    // Format results
    const deals = elements
      .map((el) => {
        const tags = el.tags || {};
        const name = tags.name || "Local Place";

        const placeLat = el.lat || (el.center && el.center.lat);
        const placeLon = el.lon || (el.center && el.center.lon);
        if (!placeLat || !placeLon) return null;

        const miles = distanceMiles(userLat, userLon, placeLat, placeLon);

        return {
          id: String(el.id),
          storeName: name,
          title: `Visit ${name}`,
          description: `Local place near you.`,
          distanceMiles: miles,
          category: tags.amenity || tags.shop || "Local",
          address: tags["addr:street"] || "",
          expiryDate: null,
          promoCode: "",
          url: null,
          latitude: placeLat,
          longitude: placeLon,
          originalPrice: null,
          discountedPrice: null
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.distanceMiles - b.distanceMiles)
      .slice(0, 50);

    res.json(deals);
  } catch (err) {
    console.error("Error in /deals/nearby:", err.message);
    res.status(500).json({ error: "Failed to fetch nearby places" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Deals API listening on port", PORT);
});
