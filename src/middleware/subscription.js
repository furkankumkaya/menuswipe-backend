// src/middleware/subscription.js
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// Plan hierarchy
const PLAN_LEVELS = { TRIAL: 1, BASIC: 2, PRO: 3 };

// Trial süresi: 15 gün
const TRIAL_DAYS = 15;

/**
 * Plan ve subscription durumunu döner
 */
function getSubscriptionInfo(org) {
  const now = new Date();
  const plan = org.plan || "TRIAL";
  const planStatus = org.planStatus || "TRIAL";

  // Aktif ödenen abonelik
  if ((plan === "BASIC" || plan === "PRO") && planStatus === "ACTIVE") {
    if (!org.currentPeriodEnd || new Date(org.currentPeriodEnd) > now) {
      return { status: "ACTIVE", plan, isActive: true, daysLeft: null };
    }
  }

  // Trial
  if (plan === "TRIAL" || planStatus === "TRIAL") {
    if (org.trialEndsAt && new Date(org.trialEndsAt) > now) {
      const daysLeft = Math.ceil((new Date(org.trialEndsAt) - now) / (1000 * 60 * 60 * 24));
      return { status: "TRIAL", plan: "TRIAL", isActive: true, daysLeft };
    }
    return { status: "EXPIRED", plan: "TRIAL", isActive: false, daysLeft: 0 };
  }

  // Past due - grace period (3 gün)
  if (planStatus === "PAST_DUE") {
    return { status: "PAST_DUE", plan, isActive: true, daysLeft: null };
  }

  return { status: "EXPIRED", plan, isActive: false, daysLeft: 0 };
}

/**
 * Public menüye erişimi kontrol eder
 */
async function checkMenuAccessible(orgId) {
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) return { accessible: false, reason: "not_found" };

  const info = getSubscriptionInfo(org);
  return { accessible: info.isActive, reason: info.isActive ? "ok" : "expired", info };
}

/**
 * req.subscription'a subscription bilgisini ekler
 */
function attachSubscription(req, res, next) {
  if (!req.org) return next();
  req.subscription = getSubscriptionInfo(req.org);
  next();
}

/**
 * Minimum plan seviyesi gerektiren middleware
 * Örnek: requirePlan("PRO") → sadece PRO erişebilir
 */
function requirePlan(minPlan) {
  const minLevel = PLAN_LEVELS[minPlan] || 1;
  return (req, res, next) => {
    if (!req.org) return res.status(401).json({ error: "Unauthorized" });
    const info = getSubscriptionInfo(req.org);

    // Trial sırasında her şey açık
    if (info.status === "TRIAL" && info.isActive) return next();

    const userLevel = PLAN_LEVELS[info.plan] || 0;
    if (info.isActive && userLevel >= minLevel) return next();

    return res.status(402).json({
      error: "Plan upgrade required",
      requiredPlan: minPlan,
      currentPlan: info.plan,
      subscriptionStatus: info.status,
    });
  };
}

/**
 * Plan limitlerini döner
 */
function getPlanLimits(plan) {
  const limits = {
    TRIAL: {
      maxBranches: 1,
      maxPhotos: 3,
      languages: ["tr", "en"],
      unlimitedItems: true,
    },
    BASIC: {
      maxBranches: 1,
      maxPhotos: 3,
      languages: ["tr", "en"],
      unlimitedItems: true,
    },
    PRO: {
      maxBranches: 5,
      maxPhotos: 5,
      languages: null, // sınırsız
      unlimitedItems: true,
    },
  };
  return limits[plan] || limits.BASIC;
}

module.exports = {
  TRIAL_DAYS,
  getSubscriptionInfo,
  checkMenuAccessible,
  attachSubscription,
  requirePlan,
  getPlanLimits,
  // legacy export
  getMaxLanguages: (plan) => plan === "PRO" ? Infinity : 1,
};
