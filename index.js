const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// TEMP SAMPLE DEALS – you can add more later
const deals = [
  {
    id: "1",
    storeName: "McDonald's",
    title: "Buy 1 Get 1 Free Big Mac",
    description: "Limited time offer on Big Macs.",
    latitude: 42.103,
    longitude: -72.5914,
    category: "Food",
    address: "123 Main St, Springfield, MA",
    expiryDate: "2025-12-15",
    promoCode: "BOGO",
    url: "https://www.mcdonalds.com",
    originalPrice: 12,
    discountedPrice: 6
  },
  {
    id: "2",
    storeName: "Walmart",
    title: "$10 Off $50 Purchase",
    description: "Save on your next grocery trip.",
    latitude: 42.1334,
    longitude: -72.75,
    category: "Retail",
    address: "110 Walmart Dr, Westfield, MA",
    expiryDate: "2025-12-20",
    promoCode: "SAVE10",
    url: "https://www.walmart.com",
    originalPrice: 50,
    discountedPrice: 40
  }
];

function distanceMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const toRad = deg => (deg * Math.PI) / 180;
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

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/deals/nearby", (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  const radius = parseFloat(req.query.radius || "20");
  const category = req.query.category || null;

  if (isNaN(lat) || isNaN(lon)) {
    return res.status(400).json({ error: "lat and lon are required query params" });
  }

  let withDistance = deals.map(d => {
    const dist = distanceMiles(lat, lon, d.latitude, d.longitude);
    return { ...d, distanceMiles: dist };
  });

  if (category) {
    withDistance = withDistance.filter(d =>
      d.category.toLowerCase() === category.toLowerCase()
    );
  }

  let filtered = withDistance.filter(d => d.distanceMiles <= radius);

  if (filtered.length === 0) {
    filtered = withDistance.sort((a, b) => a.distanceMiles - b.distanceMiles).slice(0, 20);
  } else {
    filtered = filtered.sort((a, b) => a.distanceMiles - b.distanceMiles);
  }

  res.json(filtered);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Deals API listening on port", PORT);
});
