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
      currentPeriodEnd: req.org.currentPeriodEnd,
      billingCycle: req.org.billingCycle,
      maxLanguages: maxLangs === Infinity ? -1 : maxLangs,
      currentLanguageCount: (req.org.enabledLanguages || []).length,
    });
  } catch (err) { next(err); }
});

// Stripe checkout'a yönlendir
router.post("/upgrade", requireAuth, async (req, res, next) => {
  try {
    const { plan, cycle } = req.body;
    if (!["BASIC", "PRO"].includes(plan)) {
      return res.status(400).json({ error: "Invalid plan" });
    }
    if (!["MONTHLY", "YEARLY"].includes(cycle)) {
      return res.status(400).json({ error: "Invalid billing cycle" });
    }
    // Stripe checkout create-checkout endpoint'ine yönlendir
    res.json({ redirect: "/api/stripe/create-checkout" });
  } catch (err) { next(err); }
});

// Beta/PRO hesabı atama (admin tool)
router.post("/grant-beta", requireAuth, async (req, res, next) => {
  try {
    const { secretKey } = req.body;
    if (secretKey !== process.env.BETA_GRANT_SECRET) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const currentPeriodEnd = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

    const updated = await prisma.organization.update({
      where: { id: req.org.id },
      data: {
        plan: "PRO",
        billingCycle: "YEARLY",
        planStatus: "ACTIVE",
        currentPeriodEnd,
      },
    });

    res.json({ success: true, ...getSubscriptionInfo(updated) });
  } catch (err) { next(err); }
});

// Migration trigger - mevcut hesapları setup eder
router.post("/admin/run-migration", async (req, res, next) => {
  try {
    const { secretKey } = req.body;
    if (secretKey !== process.env.BETA_GRANT_SECRET || !process.env.BETA_GRANT_SECRET) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const BETA_EMAILS = (process.env.BETA_EMAILS || "")
      .split(",")
      .map(e => e.trim().toLowerCase())
      .filter(Boolean);

    const orgs = await prisma.organization.findMany({ include: { users: true } });
    const results = [];

    for (const org of orgs) {
      const ownerEmail = org.users[0]?.email?.toLowerCase();
      const isBeta = ownerEmail && BETA_EMAILS.includes(ownerEmail);
      const data = {};

      if (!org.defaultLanguage) data.defaultLanguage = "en";
      if (!org.enabledLanguages || org.enabledLanguages.length === 0) data.enabledLanguages = [];

      if (isBeta) {
        data.plan = "PRO";
        data.planStatus = "ACTIVE";
        data.billingCycle = "YEARLY";
        data.currentPeriodEnd = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
        results.push({ slug: org.slug, email: ownerEmail, action: "PRO (beta)" });
      } else if (!org.trialEndsAt) {
        const trialStart = org.createdAt || new Date();
        const trialEnd = new Date(trialStart.getTime() + 15 * 24 * 60 * 60 * 1000);
        data.plan = "TRIAL";
        data.planStatus = "TRIAL";
        data.trialEndsAt = trialEnd;
        results.push({ slug: org.slug, email: ownerEmail, action: "TRIAL setup" });
      } else {
        results.push({ slug: org.slug, email: ownerEmail, action: "skipped" });
        continue;
      }

      if (Object.keys(data).length > 0) {
        await prisma.organization.update({ where: { id: org.id }, data });
      }
    }

    res.json({ success: true, count: orgs.length, results });
  } catch (err) { next(err); }
});

module.exports = router;
