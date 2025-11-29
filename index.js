const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// -------------------- Helpers --------------------

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

// Amenities and shops we consider "good" consumer places
const GOOD_AMENITIES = new Set([
  "restaurant",
  "fast_food",
  "cafe",
  "bar",
  "pub",
  "biergarten",
  "ice_cream",
  "food_court",
  "fuel",
  "charging_station",
  "pharmacy",
  "bank",
  "atm",
  "cinema",
  "theatre",
  "nightclub",
  "pub",
  "biergarten",
  "bbq",
  "biergarten",
  "clinic",
  "doctors",
  "dentist",
  "veterinary",
  "library",
  "biergarten",
  "car_wash",
  "car_rental"
]);

const GOOD_SHOPS = new Set([
  "supermarket",
  "convenience",
  "department_store",
  "mall",
  "variety_store",
  "general",
  "clothes",
  "shoes",
  "jewelry",
  "beauty",
  "cosmetics",
  "hairdresser",
  "electronics",
  "computer",
  "mobile_phone",
  "doityourself",
  "hardware",
  "houseware",
  "sports",
  "outdoor",
  "toys",
  "alcohol",
  "bakery",
  "butcher",
  "greengrocer",
  "beverages",
  "wholesale",
  "gift",
  "books",
  "florist",
  "pet",
  "car",
  "car_parts",
  "car_repair",
  "furniture",
  "kiosk",
  "stationery",
  "deli",
  "seafood"
]);

// Overpass servers (rotate to avoid rate limits)
const OVERPASS_SERVERS = [
  "https://overpass-api.de/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
  "https://z.overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
];

async function fetchOverpass(query) {
  for (const url of OVERPASS_SERVERS) {
    try {
      console.log("Trying Overpass server:", url);
      const response = await axios.post(url, query, {
        headers: { "Content-Type": "text/plain" },
        timeout: 25000
      });

      if (typeof response.data === "string" && response.data.includes("<html")) {
        console.log("Bad Overpass HTML response, skipping:", url);
        continue;
      }

      console.log("Using Overpass server:", url);
      return response.data;
    } catch (err) {
      console.log("Overpass failed:", url, err.message);
    }
  }
  throw new Error("All Overpass servers failed");
}

// -------------------- Routes --------------------

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

    // Category → Overpass filter
    let overpassFilter;
    switch ((category || "").toLowerCase()) {
      case "food":
        overpassFilter = `
          node(around:RADIUS,USER_LAT,USER_LON)["amenity"~"restaurant|fast_food|cafe|bar|pub|ice_cream|food_court|bbq"];
          node(around:RADIUS,USER_LAT,USER_LON)["shop"~"bakery|butcher|greengrocer|alcohol|supermarket|convenience|deli|seafood"];
        `;
        break;
      case "gas":
        overpassFilter = `
          node(around:RADIUS,USER_LAT,USER_LON)["amenity"="fuel"];
          node(around:RADIUS,USER_LAT,USER_LON)["amenity"="charging_station"];
        `;
        break;
      case "groceries":
        overpassFilter = `
          node(around:RADIUS,USER_LAT,USER_LON)["shop"~"supermarket|convenience|greengrocer|bakery|butcher|deli"];
        `;
        break;
      default:
        // All shops + all amenities (we'll filter in JS)
        overpassFilter = `
          node(around:RADIUS,USER_LAT,USER_LON)["shop"];
          node(around:RADIUS,USER_LAT,USER_LON)["amenity"];
        `;
        break;
    }

    let query = `
      [out:json][timeout:30];
      (
        ${overpassFilter}
      );
      out center 80;
    `
      .replace(/RADIUS/g, radiusMeters.toString())
      .replace(/USER_LAT/g, userLat.toString())
      .replace(/USER_LON/g, userLon.toString());

    const data = await fetchOverpass(query);
    const elements = data.elements || [];

    // First pass: convert raw OSM → uniform objects
    const cleaned = elements
      .map((el) => {
        const tags = el.tags || {};
        const name = tags.name || "Local Place";
        const amenity = tags.amenity || null;
        const shop = tags.shop || null;

        const placeLat = el.lat || (el.center && el.center.lat);
        const placeLon = el.lon || (el.center && el.center.lon);
        if (!placeLat || !placeLon) return null;

        const miles = distanceMiles(userLat, userLon, placeLat, placeLon);

        const addressParts = [];
        if (tags["addr:housenumber"]) addressParts.push(tags["addr:housenumber"]);
        if (tags["addr:street"]) addressParts.push(tags["addr:street"]);
        const street = addressParts.join(" ");
        const city = tags["addr:city"] || "";
        const fullAddress = [street, city].filter(Boolean).join(", ");

        const osmWebsite =
          tags.website || tags["contact:website"] || tags.url || null;

        let mapsQuery;
        if (name && city) {
          mapsQuery = `${name} ${city}`;
        } else if (name && street) {
          mapsQuery = `${name} ${street}`;
        } else {
          mapsQuery = `${placeLat},${placeLon}`;
        }

        const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          mapsQuery
        )}`;

        const finalUrl = osmWebsite || googleMapsUrl;

        const categoryLabel =
          shop || amenity || tags.cuisine || tags["shop"] || "Local";

        const isDealCandidate =
          (amenity && GOOD_AMENITIES.has(amenity)) ||
          (shop && GOOD_SHOPS.has(shop));

        return {
          id: String(el.id),
          storeName: name,
          title: `Visit ${name}`,
          description: "Local place near you.",
          distanceMiles: miles,
          category: categoryLabel,
          address: fullAddress,
          expiryDate: null,
          promoCode: "",
          url: finalUrl,
          latitude: placeLat,
          longitude: placeLon,
          originalPrice: null,
          discountedPrice: null,
          isDealCandidate
        };
      })
      .filter(Boolean);

    // Primary list: only "good" consumer places
    let deals = cleaned
      .filter((d) => d.isDealCandidate)
      .sort((a, b) => a.distanceMiles - b.distanceMiles)
      .slice(0, 50);

    // Fallback: if nothing qualifies, just show the 20 closest places (no empty array)
    if (deals.length === 0) {
      console.log("No deal candidates, falling back to nearest places.");
      deals = cleaned
        .sort((a, b) => a.distanceMiles - b.distanceMiles)
        .slice(0, 20);
    }

    // Optional: strip internal flag before sending to client
    const response = deals.map(({ isDealCandidate, ...rest }) => rest);

    res.json(response);
  } catch (err) {
    console.error("Error in /deals/nearby:", err.message);
    res.status(500).json({ error: "Failed to fetch nearby places" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Deals API listening on port", PORT);
});
