const router = require("express").Router();
const { PrismaClient } = require("@prisma/client");
const { requireAuth } = require("../middleware/auth");
const { getSubscriptionInfo, getMaxLanguages } = require("../middleware/subscription");

const prisma = new PrismaClient();

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const info = getSubscriptionInfo(req.org);
    const maxLangs = getMaxLanguages(info.plan);
    
    res.json({
      ...info,
      trialEndsAt: req.org.trialEndsAt,
      subscriptionEndsAt: req.org.subscriptionEndsAt,
      billingCycle: req.org.billingCycle,
      maxLanguages: maxLangs === Infinity ? -1 : maxLangs,
      currentLanguageCount: (req.org.enabledLanguages || []).length,
    });
  } catch (err) { next(err); }
});

// Plan upgrade (placeholder, Stripe sonra)
router.post("/upgrade", requireAuth, async (req, res, next) => {
  try {
    const { plan, billingCycle } = req.body;
    if (!["STARTER", "PRO"].includes(plan)) {
      return res.status(400).json({ error: "Invalid plan" });
    }
    if (!["MONTHLY", "YEARLY"].includes(billingCycle)) {
      return res.status(400).json({ error: "Invalid billing cycle" });
    }
    
    // Mock upgrade - gerçek Stripe entegrasyonu sonra
    const days = billingCycle === "YEARLY" ? 365 : 30;
    const subscriptionEndsAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    
    const updated = await prisma.organization.update({
      where: { id: req.org.id },
      data: {
        plan,
        billingCycle,
        subscriptionStatus: "ACTIVE",
        subscriptionEndsAt,
      },
    });
    
    res.json({
      success: true,
      message: "Subscription activated (mock - Stripe integration pending)",
      ...getSubscriptionInfo(updated),
    });
  } catch (err) { next(err); }
});

// Pro/Beta hesabı atama (admin tool, gerçek hayatta korumalı olmalı)
// Şu an kendin ve test kullanıcılarını PRO yapmak için kullanılır
router.post("/grant-beta", requireAuth, async (req, res, next) => {
  try {
    // Sadece kendi hesabını grantleyebilir, beta gizli yol
    const { secretKey } = req.body;
    if (secretKey !== process.env.BETA_GRANT_SECRET) {
      return res.status(403).json({ error: "Forbidden" });
    }
    
    const subscriptionEndsAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 yıl
    
    const updated = await prisma.organization.update({
      where: { id: req.org.id },
      data: {
        plan: "PRO",
        billingCycle: "YEARLY",
        subscriptionStatus: "ACTIVE",
        subscriptionEndsAt,
      },
    });
    
    res.json({ success: true, ...getSubscriptionInfo(updated) });
  } catch (err) { next(err); }
});

module.exports = router;
