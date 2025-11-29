const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// ----- CONFIG -----
const GOOGLE_PLACES_KEY = process.env.GOOGLE_PLACES_KEY; // set this in Railway

// Haversine distance in miles between two lat/lon points
function distanceMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8; // Earth radius in miles
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

function buildPhotoUrl(photoRef) {
  if (!photoRef || !GOOGLE_PLACES_KEY) return null;
  return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${photoRef}&key=${GOOGLE_PLACES_KEY}`;
}

// Simple health check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Main endpoint used by Creao
app.get("/deals/nearby", async (req, res) => {
  try {
    const { lat, lon, radius = 10, category, search } = req.query;

    if (!lat || !lon) {
      return res
        .status(400)
        .json({ error: "lat and lon are required query params" });
    }

    if (!GOOGLE_PLACES_KEY) {
      return res
        .status(500)
        .json({ error: "GOOGLE_PLACES_KEY is not set on the server" });
    }

    const userLat = parseFloat(lat);
    const userLon = parseFloat(lon);
    const radiusMiles = Number(radius) || 10;
    // Google Places radius is in meters, max 50,000
    const radiusMeters = Math.min(
      Math.round(radiusMiles * 1609.34),
      50000
    );

    // Map your category tabs -> Google Places types
    let type;
    switch ((category || "").toLowerCase()) {
      case "food":
        type = "restaurant";
        break;
      case "groceries":
        type = "supermarket";
        break;
      case "gas":
        type = "gas_station";
        break;
      default:
        type = "store"; // generic store / shop
        break;
    }

    const params = {
      location: `${userLat},${userLon}`,
      radius: radiusMeters,
      key: GOOGLE_PLACES_KEY,
      type
    };

    // Optional text search from your search bar
    if (search && String(search).trim().length > 0) {
      params.keyword = String(search).trim();
    }

    const placesResp = await axios.get(
      "https://maps.googleapis.com/maps/api/place/nearbysearch/json",
      { params }
    );

    if (placesResp.data.status !== "OK" && placesResp.data.status !== "ZERO_RESULTS") {
      console.error("Google Places error:", placesResp.data);
      return res.status(500).json({
        error: "Google Places API error",
        status: placesResp.data.status
      });
    }

    const results = placesResp.data.results || [];

    const deals = results
      .map((place) => {
        const loc = place.geometry && place.geometry.location;
        if (!loc || loc.lat == null || loc.lng == null) return null;

        const dist = distanceMiles(userLat, userLon, loc.lat, loc.lng);

        const primaryType = (place.types && place.types[0]) || "local";

        const photoRef =
          place.photos && place.photos.length > 0
            ? place.photos[0].photo_reference
            : null;

        return {
          id: place.place_id,
          storeName: place.name,
          title: place.name, // you can change this later to a more "deal" title
          description: place.vicinity || "Local place near you.",
          distanceMiles: dist,
          category: primaryType,
          address: place.vicinity || "",
          expiryDate: null,
          promoCode: "",
          url: `https://www.google.com/maps/place/?q=place_id:${place.place_id}`,
          latitude: loc.lat,
          longitude: loc.lng,
          originalPrice: null,
          discountedPrice: null,
          imageUrl: buildPhotoUrl(photoRef),
          rating: place.rating || null,
          userRatingsTotal: place.user_ratings_total || null
        };
      })
      .filter((d) => d && typeof d.distanceMiles === "number")
      .sort((a, b) => a.distanceMiles - b.distanceMiles)
      .slice(0, 50);

    res.json(deals);
  } catch (err) {
    console.error("Error in /deals/nearby:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to fetch nearby deals" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Deals API listening on port", PORT);
});
