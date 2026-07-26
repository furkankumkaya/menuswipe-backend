const router = require("express").Router();
const { PrismaClient } = require("@prisma/client");
const { requireAuth } = require("../middleware/auth");
const { getSubscriptionInfo } = require("../middleware/subscription");

const prisma = new PrismaClient();

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "").split(",").map(e => e.trim()).filter(Boolean);

function requireAdmin(req, res, next) {
  if (!req.user || !ADMIN_EMAILS.includes(req.user.email)) {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

// ── STATS ────────────────────────────────────────────
router.get("/stats", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const allOrgs = await prisma.organization.findMany({
      select: { id: true, plan: true, subscriptionStatus: true, trialEndsAt: true, subscriptionEndsAt: true, createdAt: true },
    });

    const totalOrgs = allOrgs.length;
    const newThisMonth = allOrgs.filter(o => o.createdAt >= monthStart).length;

    let activeOrgs = 0, trialOrgs = 0, expiredOrgs = 0;
    let churnRisk = 0;
    const threeDays = 3 * 24 * 60 * 60 * 1000;

    for (const o of allOrgs) {
      const info = getSubscriptionInfo(o);
      if (info.status === "ACTIVE") activeOrgs++;
      else if (info.status === "TRIAL" && info.isActive) {
        trialOrgs++;
        if (o.trialEndsAt && (o.trialEndsAt - now) < threeDays && (o.trialEndsAt - now) > 0) churnRisk++;
      }
      else expiredOrgs++;
    }

    const conversionRate = totalOrgs > 0 ? Math.round((activeOrgs / totalOrgs) * 100) : 0;

    // Revenue placeholder (no Payment model yet)
    const revenue = { thisMonth: 0, lastMonth: 0, total: 0 };

    res.json({ totalOrgs, newThisMonth, activeOrgs, trialOrgs, expiredOrgs, churnRisk, conversionRate, revenue });
  } catch (err) { next(err); }
});

// ── RESTAURANTS ──────────────────────────────────────
router.get("/restaurants", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const perPage = 20;
    const status = req.query.status || "";
    const search = req.query.search || "";

    const where = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { users: { some: { email: { contains: search, mode: "insensitive" } } } },
      ];
    }

    // Filter by computed status
    if (status === "ACTIVE") {
      where.subscriptionStatus = "ACTIVE";
      where.plan = { in: ["BASIC", "PRO", "STARTER"] };
    } else if (status === "TRIAL") {
      where.plan = "TRIAL";
      where.trialEndsAt = { gt: new Date() };
    } else if (status === "EXPIRED") {
      where.OR = [
        { plan: "TRIAL", trialEndsAt: { lte: new Date() } },
        { subscriptionStatus: { in: ["EXPIRED", "CANCELLED"] } },
      ];
      // Override search OR if present
      if (search) {
        where.AND = [
          { OR: [
            { name: { contains: search, mode: "insensitive" } },
            { users: { some: { email: { contains: search, mode: "insensitive" } } } },
          ]},
          { OR: [
            { plan: "TRIAL", trialEndsAt: { lte: new Date() } },
            { subscriptionStatus: { in: ["EXPIRED", "CANCELLED"] } },
          ]},
        ];
        delete where.OR;
      }
    }

    const [total, orgs] = await Promise.all([
      prisma.organization.count({ where }),
      prisma.organization.findMany({
        where,
        include: {
          users: { select: { email: true, name: true }, take: 1 },
          _count: { select: { menuItems: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);

    const mapped = orgs.map(o => {
      const info = getSubscriptionInfo(o);
      return { ...o, planStatus: info.status };
    });

    res.json({ orgs: mapped, total, page, pages: Math.ceil(total / perPage) || 1 });
  } catch (err) { next(err); }
});

// ── SET PLAN ─────────────────────────────────────────
router.post("/restaurant/:id/set-plan", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { plan, planStatus, days } = req.body;
    const data = {};
    if (plan) data.plan = plan;
    if (planStatus) data.subscriptionStatus = planStatus;
    if (days) {
      const end = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      if (plan === "TRIAL" || (!plan && planStatus === "TRIAL")) {
        data.trialEndsAt = end;
      } else {
        data.subscriptionEndsAt = end;
        if (!data.subscriptionStatus) data.subscriptionStatus = "ACTIVE";
      }
    }
    const org = await prisma.organization.update({ where: { id: req.params.id }, data });
    res.json({ ok: true, org: { id: org.id, name: org.name, plan: org.plan, subscriptionStatus: org.subscriptionStatus } });
  } catch (err) { next(err); }
});

// ── EXTEND TRIAL ─────────────────────────────────────
router.post("/restaurant/:id/extend-trial", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { days } = req.body;
    const org = await prisma.organization.findUnique({ where: { id: req.params.id } });
    if (!org) return res.status(404).json({ error: "Not found" });

    const base = org.trialEndsAt && org.trialEndsAt > new Date() ? org.trialEndsAt : new Date();
    const newEnd = new Date(base.getTime() + (days || 7) * 24 * 60 * 60 * 1000);

    await prisma.organization.update({ where: { id: req.params.id }, data: { trialEndsAt: newEnd } });
    res.json({ ok: true, trialEndsAt: newEnd });
  } catch (err) { next(err); }
});

// ── DELETE RESTAURANT ────────────────────────────────
router.delete("/restaurant/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    await prisma.organization.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── REVENUE ──────────────────────────────────────────
router.get("/revenue", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    // Generate last 6 months placeholder
    const monthly = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthly.push({ month: d.toLocaleDateString("en", { month: "short" }), amount: 0 });
    }
    res.json({ monthly, transactions: [] });
  } catch (err) { next(err); }
});

// ── SALES APPLICATIONS ───────────────────────────────
router.get("/sales-applications", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const apps = await prisma.salesApplication.findMany({ orderBy: { createdAt: "desc" } });
    res.json(apps);
  } catch (err) { next(err); }
});

router.post("/approve-sales/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const bcrypt = require("bcryptjs");
    const crypto = require("crypto");
    const app = await prisma.salesApplication.findUnique({ where: { id: req.params.id } });
    if (!app) return res.status(404).json({ error: "Application not found" });
    if (app.status !== "PENDING") return res.status(400).json({ error: "Already processed" });

    // Create sales user with their own org
    const slug = app.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 30) + "-sales-" + Date.now();
    const org = await prisma.organization.create({
      data: {
        name: app.name + " (Sales)", slug,
        currency: "USD", defaultLanguage: "en", enabledLanguages: [],
        plan: "PRO", subscriptionStatus: "ACTIVE",
        subscriptionEndsAt: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000),
        onboardingCompleted: true,
        qrSecret: crypto.randomBytes(16).toString("hex"),
        users: { create: { email: app.email, passwordHash: app.passwordHash, name: app.name, role: "SALES" } },
        branches: { create: { name: app.name, slug: "main", active: true } },
      },
    });

    await prisma.salesApplication.update({
      where: { id: req.params.id },
      data: { status: "APPROVED", approvedAt: new Date() },
    });

    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post("/reject-sales/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    await prisma.salesApplication.update({
      where: { id: req.params.id },
      data: { status: "REJECTED", rejectionReason: req.body.reason || null },
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── SALES TEAM ───────────────────────────────────────
router.get("/sales-team", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const salesUsers = await prisma.user.findMany({
      where: { role: "SALES" },
      include: { organization: { select: { name: true } } },
    });

    const result = [];
    for (const u of salesUsers) {
      const demos = await prisma.salesDemo.findMany({ where: { salesUserId: u.id } });
      const totalClaims = demos.length;
      const claimedCount = demos.filter(d => d.status !== "CREATED").length;
      const conversionRate = totalClaims > 0 ? Math.round((claimedCount / totalClaims) * 100) : 0;
      result.push({ name: u.name, email: u.email, orgName: u.organization?.name, totalClaims, claimedCount, conversionRate });
    }

    res.json(result);
  } catch (err) { next(err); }
});

router.post("/grant-sales", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: "User not found" });
    await prisma.user.update({ where: { id: user.id }, data: { role: "SALES" } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post("/revoke-sales", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: "User not found" });
    await prisma.user.update({ where: { id: user.id }, data: { role: "OWNER" } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── ERROR LOGS (stub) ────────────────────────────────
router.get("/error-logs", requireAuth, requireAdmin, async (req, res) => {
  res.json([]);
});

module.exports = router;
