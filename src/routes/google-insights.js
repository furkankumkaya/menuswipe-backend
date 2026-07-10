const router = require("express").Router();
const { PrismaClient } = require("@prisma/client");
const { requireAuth } = require("../middleware/auth");
const { fetchGoogleInsights, fetchRestaurantInfo } = require("../services/gemini");

const prisma = new PrismaClient();

const STALE_DAYS = 7;

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

/**
 * Manuel refresh - admin paneli'nden butonla tetiklenir.
 */
router.post("/refresh", requireAuth, async (req, res, next) => {
  try {
    const org = await prisma.organization.findUnique({ where: { id: req.org.id } });
    if (!org) return res.status(404).json({ error: "not_found" });
    
    if (!org.googleMapsUrl && (!org.name || org.name === "My Restaurant")) {
      return res.status(400).json({ 
        error: "no_info", 
        message: "Please add your Google Maps URL and restaurant name in Profile first." 
      });
    }
    
    const insights = await fetchGoogleInsights(org);
    if (!insights) {
      return res.status(500).json({ 
        error: "fetch_failed", 
        message: "Could not connect to Google. Please try again." 
      });
    }
    
    // notFound true ise de kaydet ama kullanıcıya bildir
    await prisma.organization.update({
      where: { id: org.id },
      data: { googleInsights: insights },
    });
    
    const message = insights.notFound
      ? `Restaurant not found on Google Reviews. Try adding your exact restaurant name. (${insights.notes})`
      : `Found ${insights.popularDishes.length} popular dishes!`;
    
    res.json({ ok: true, insights, message, notFound: !!insights.notFound });
  } catch (err) {
    console.error("[google-insights] refresh error:", err.message);
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

/**
 * Mevcut insights'ı dön.
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.org.id },
      select: { googleInsights: true, googleMapsUrl: true },
    });
    res.json({
      insights: org?.googleInsights || null,
      hasGoogleUrl: !!org?.googleMapsUrl,
    });
  } catch (err) {
    res.json({ insights: null });
  }
});

/**
 * Cron endpoint - tüm restoranların eski insights'larını yeniler.
 * Bu endpoint cron job veya manuel admin tarafından tetiklenir.
 * CRON_SECRET env variable ile korunur.
 */
router.post("/cron-refresh-all", async (req, res) => {
  const secret = req.headers["x-cron-secret"];
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "unauthorized" });
  }
  
  try {
    const staleDate = new Date(Date.now() - STALE_DAYS * 86400000);
    const orgs = await prisma.organization.findMany({
      where: {
        AND: [
          { OR: [{ googleMapsUrl: { not: null } }, { name: { not: "" } }] },
        ],
      },
      select: { id: true, name: true, googleMapsUrl: true, city: true, country: true, address: true, googleInsights: true },
    });
    
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    
    for (const org of orgs) {
      // Eğer son fetch 7 günden daha yeniyse atla
      const lastFetch = org.googleInsights?.fetchedAt ? new Date(org.googleInsights.fetchedAt) : null;
      if (lastFetch && lastFetch > staleDate) {
        skipped++;
        continue;
      }
      
      try {
        const insights = await fetchGoogleInsights(org);
        if (insights) {
          await prisma.organization.update({
            where: { id: org.id },
            data: { googleInsights: insights },
          });
          updated++;
        } else {
          failed++;
        }
        // Rate limit'e yakalanmamak için kısa bekleme
        await new Promise(r => setTimeout(r, 1500));
      } catch (e) {
        console.error("[cron] failed for", org.name, e.message);
        failed++;
      }
    }
    
    res.json({ ok: true, updated, skipped, failed, total: orgs.length });
  } catch (err) {
    console.error("[cron] error:", err.message);
    res.status(500).json({ error: "server_error" });
  }
});

module.exports = router;
