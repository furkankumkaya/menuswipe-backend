const router = require("express").Router();
const { requireAuth } = require("../middleware/auth");
const { fetchRestaurantInfo } = require("../services/gemini");

/**
 * Google Maps URL'inden restoran bilgilerini çek (onboarding).
 */
router.post("/extract-info", requireAuth, async (req, res) => {
  try {
    const { googleMapsUrl, restaurantName } = req.body;
    if (!googleMapsUrl && !restaurantName) {
      return res.status(400).json({ error: "googleMapsUrl or restaurantName is required" });
    }

    const info = await fetchRestaurantInfo(googleMapsUrl, restaurantName);
    if (!info) {
      return res.status(500).json({ error: "Could not extract restaurant info" });
    }

    res.json({ ok: true, info });
  } catch (err) {
    console.error("[extract-info] error:", err.message);
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

module.exports = router;
