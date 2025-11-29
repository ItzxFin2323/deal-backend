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

// consumer-facing amenities & shops
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
  "cinema",
  "theatre",
  "nightclub",
  "car_wash"
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
  "seafood",
  "discount",
  "department_store"
]);

// Overpass servers for fallback
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

// -------------------- Deal enrichment --------------------

function enrichWithDeals(place) {
  const name = (place.storeName || "").toLowerCase();
  const cat = (place.category || "").toLowerCase();

  let dealTitle = null;
  let dealSubtitle = null;
  let dealUrl = null;
  let dealSource = null; // "brand" or "category"

  // ---- Brand specific deals ----
  if (name.includes("mcdonald")) {
    dealTitle = "McDonald's app & deals";
    dealSubtitle = "Check latest offers and app-only deals.";
    dealUrl = "https://www.mcdonalds.com/us/en-us/deals.html";
    dealSource = "brand";
  } else if (name.includes("burger king")) {
    dealTitle = "Burger King offers";
    dealSubtitle = "See current Royal Perks and coupons.";
    dealUrl = "https://www.bk.com/offers";
    dealSource = "brand";
  } else if (name.includes("wendy")) {
    dealTitle = "Wendy's rewards & deals";
    dealSubtitle = "View current offers in the Wendy's app.";
    dealUrl = "https://www.wendys.com/deals";
    dealSource = "brand";
  } else if (name.includes("subway")) {
    dealTitle = "Subway deals";
    dealSubtitle = "Subs, coupons and app offers.";
    dealUrl = "https://www.subway.com/en-US/Deals";
    dealSource = "brand";
  } else if (name.includes("starbucks")) {
    dealTitle = "Starbucks rewards offers";
    dealSubtitle = "Check Star Rewards and featured drinks.";
    dealUrl = "https://www.starbucks.com/rewards";
    dealSource = "brand";
  } else if (name.includes("dunkin")) {
    dealTitle = "Dunkin' offers";
    dealSubtitle = "Perks and app coupons.";
    dealUrl = "https://www.dunkindonuts.com/en/ddperks";
    dealSource = "brand";
  } else if (
    name.includes("walmart")
  ) {
    dealTitle = "Walmart Rollbacks & deals";
    dealSubtitle = "Everyday savings and Rollback prices.";
    dealUrl = "https://www.walmart.com/deals";
    dealSource = "brand";
  } else if (name.includes("target")) {
    dealTitle = "Target Circle deals";
    dealSubtitle = "Weekly discounts and Circle offers.";
    dealUrl = "https://www.target.com/circle/offers";
    dealSource = "brand";
  } else if (name.includes("cvs")) {
    dealTitle = "CVS ExtraCare deals";
    dealSubtitle = "Pharmacy & weekly ad savings.";
    dealUrl = "https://www.cvs.com/extracare/home";
    dealSource = "brand";
  } else if (name.includes("walgreens")) {
    dealTitle = "Walgreens weekly ad";
    dealSubtitle = "Digital coupons and sale prices.";
    dealUrl = "https://www.walgreens.com/offers/offers.jsp";
    dealSource = "brand";
  } else if (name.includes("dollar general")) {
    dealTitle = "Dollar General digital coupons";
    dealSubtitle = "Clip and save on weekly deals.";
    dealUrl = "https://www.dollargeneral.com/coupons.html";
    dealSource = "brand";
  } else if (name.includes("costco")) {
    dealTitle = "Costco savings & offers";
    dealSubtitle = "See current warehouse deals.";
    dealUrl = "https://www.costco.com/warehouse-savings.html";
    dealSource = "brand";
  } else if (name.includes("aldi")) {
    dealTitle = "ALDI weekly specials";
    dealSubtitle = "Store specials and limited-time finds.";
    dealUrl = "https://www.aldi.us/en/weekly-specials/";
    dealSource = "brand";
  } else if (name.includes("home depot")) {
    dealTitle = "Home Depot savings";
    dealSubtitle = "Special buys and promotions.";
    dealUrl = "https://www.homedepot.com/c/Savings_Center";
    dealSource = "brand";
  } else if (name.includes("lowe's") || name.includes("lowes")) {
    dealTitle = "Lowe's deals";
    dealSubtitle = "Savings and weekly specials.";
    dealUrl = "https://www.lowes.com/l/deals";
    dealSource = "brand";
  }

  // ---- Category fallback deals (if no brand match) ----
  if (!dealUrl) {
    if (
      cat.includes("restaurant") ||
      cat.includes("cafe") ||
      cat.includes("bar") ||
      cat.includes("pub") ||
      cat.includes("food")
    ) {
      dealTitle = "Local restaurant & food deals";
      dealSubtitle = "Check nearby restaurant coupons and specials.";
      dealUrl = "https://www.groupon.com/local/restaurants";
      dealSource = "category";
    } else if (
      cat.includes("supermarket") ||
      cat.includes("convenience") ||
      cat.includes("bakery") ||
      cat.includes("butcher") ||
      cat.includes("greengrocer") ||
      cat.includes("grocery")
    ) {
      dealTitle = "Grocery deals & coupons";
      dealSubtitle = "Find grocery discounts and digital coupons.";
      dealUrl = "https://www.coupons.com/grocery/";
      dealSource = "category";
    } else if (
      cat.includes("clothes") ||
      cat.includes("shoes") ||
      cat.includes("mall") ||
      cat.includes("department")
    ) {
      dealTitle = "Clothing and retail deals";
      dealSubtitle = "Browse sales and coupon codes.";
      dealUrl = "https://www.retailmenot.com/coupons/clothing";
      dealSource = "category";
    } else if (cat.includes("fuel") || cat.includes("charging_station")) {
      dealTitle = "Gas prices near you";
      dealSubtitle = "Compare fuel prices at nearby stations.";
      dealUrl = "https://www.gasbuddy.com/home";
      dealSource = "category";
    } else if (
      cat.includes("pharmacy") ||
      cat.includes("beauty") ||
      cat.includes("cosmetics")
    ) {
      dealTitle = "Pharmacy & beauty deals";
      dealSubtitle = "Check promotions and beauty savings.";
      dealUrl = "https://www.retailmenot.com/view/all-health-beauty";
      dealSource = "category";
    }
  }

  // If still nothing, just use the place's own URL
  if (!dealUrl && place.url) {
    dealUrl = place.url;
    dealTitle = place.title;
    dealSubtitle = "View details for this location.";
    dealSource = "place";
  }

  return {
    ...place,
    dealTitle,
    dealSubtitle,
    dealUrl,
    dealSource
  };
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

    // Base normalization
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

        const basePlace = {
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

        return enrichWithDeals(basePlace);
      })
      .filter(Boolean);

    let deals = cleaned
      .filter((d) => d.isDealCandidate)
      .sort((a, b) => a.distanceMiles - b.distanceMiles)
      .slice(0, 50);

    if (deals.length === 0) {
      console.log("No deal candidates, falling back to nearest places.");
      deals = cleaned.sort((a, b) => a.distanceMiles - b.distanceMiles).slice(0, 20);
    }

    // Strip internal flag
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
