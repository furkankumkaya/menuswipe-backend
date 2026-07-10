const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// Plan hierarchy: PRO > STARTER > TRIAL
const PLAN_LEVELS = { TRIAL: 1, STARTER: 2, PRO: 3 };

// Trial süresi (gün)
const TRIAL_DAYS = 30;

/**
 * Trial bitiş tarihini ve durumunu kontrol eder
 * @returns {object} { status, daysLeft, isActive, plan }
 */
function getSubscriptionInfo(org) {
  const now = new Date();
  const plan = org.plan || "TRIAL";
  
  // PRO veya STARTER aktif aboneliği var mı?
  if ((plan === "PRO" || plan === "STARTER") && org.subscriptionStatus === "ACTIVE") {
    if (!org.subscriptionEndsAt || org.subscriptionEndsAt > now) {
      return { status: "ACTIVE", plan, isActive: true, daysLeft: null };
    }
  }
  
  // Trial mi?
  if (plan === "TRIAL" || org.subscriptionStatus === "TRIAL") {
    if (org.trialEndsAt && org.trialEndsAt > now) {
      const daysLeft = Math.ceil((org.trialEndsAt - now) / (1000 * 60 * 60 * 24));
      return { status: "TRIAL", plan: "TRIAL", isActive: true, daysLeft };
    }
    // Trial bitti
    return { status: "EXPIRED", plan: "TRIAL", isActive: false, daysLeft: 0 };
  }
  
  // Süresi dolmuş abonelik
  return { status: "EXPIRED", plan, isActive: false, daysLeft: 0 };
}

/**
 * Public menüye erişimi kontrol eder. Süresi dolmuş restoranların menüsü kapanır.
 */
async function checkMenuAccessible(orgId) {
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) return { accessible: false, reason: "not_found" };
  
  const info = getSubscriptionInfo(org);
  return { accessible: info.isActive, reason: info.isActive ? "ok" : "expired", info };
}

/**
 * Auth gerektiren endpoint'lerde subscription bilgisini req.subscription'a koyar
 */
function attachSubscription(req, res, next) {
  if (!req.org) return next();
  req.subscription = getSubscriptionInfo(req.org);
  next();
}

/**
 * Bir özellik için minimum plan seviyesi gerektiren middleware
 * Örnek: requirePlan("STARTER") → STARTER veya PRO gerekli
 */
function requirePlan(minPlan) {
  const minLevel = PLAN_LEVELS[minPlan] || 1;
  return (req, res, next) => {
    if (!req.org) return res.status(401).json({ error: "Unauthorized" });
    const info = getSubscriptionInfo(req.org);
    
    // Trial sırasında her şey açık
    if (info.status === "TRIAL" && info.isActive) return next();
    
    // Pro plan istenenden yüksek mi?
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
 * Çeviri dil sayısı limiti
 */
function getMaxLanguages(plan) {
  if (plan === "PRO") return Infinity;
  if (plan === "STARTER") return 1; // ana dil + 1 ek
  if (plan === "TRIAL") return Infinity; // trial'de serbest
  return 0;
}

module.exports = {
  TRIAL_DAYS,
  getSubscriptionInfo,
  checkMenuAccessible,
  attachSubscription,
  requirePlan,
  getMaxLanguages,
};
