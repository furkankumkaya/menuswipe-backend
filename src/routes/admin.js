// src/routes/admin.js
const router = require("express").Router();
const { PrismaClient } = require("@prisma/client");
const { verifyAuthToken } = require("../utils/jwt");

const prisma = new PrismaClient();

// Admin middleware - sadece ADMIN_EMAILS listesindeki kullanıcılar
async function requireAdmin(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "No token" });

    const payload = verifyAuthToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { organization: true },
    });
    if (!user) return res.status(401).json({ error: "User not found" });

    const adminEmails = (process.env.ADMIN_EMAILS || "")
      .split(",").map(e => e.trim().toLowerCase()).filter(Boolean);

    if (!adminEmails.includes(user.email.toLowerCase()) && user.role !== "ADMIN") {
      return res.status(403).json({ error: "Admin access required" });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// ─── GET /api/admin/stats ────────────────────────────
router.get("/stats", requireAdmin, async (req, res, next) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    const [
      totalOrgs,
      activeOrgs,
      trialOrgs,
      expiredOrgs,
      monthRevenue,
      lastMonthRevenue,
      totalRevenue,
      churnRisk,
      newThisMonth,
    ] = await Promise.all([
      prisma.organization.count(),
      prisma.organization.count({ where: { planStatus: "ACTIVE" } }),
      prisma.organization.count({ where: { planStatus: "TRIAL" } }),
      prisma.organization.count({ where: { planStatus: { in: ["EXPIRED", "CANCELLED"] } } }),
      prisma.transaction.aggregate({
        where: { status: "PAID", createdAt: { gte: startOfMonth } },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: { status: "PAID", createdAt: { gte: startOfLastMonth, lte: endOfLastMonth } },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: { status: "PAID" },
        _sum: { amount: true },
      }),
      // Trial bitimine 3 gün kalan, henüz upgrade etmemiş
      prisma.organization.count({
        where: {
          planStatus: "TRIAL",
          trialEndsAt: {
            gte: now,
            lte: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
          },
        },
      }),
      prisma.organization.count({ where: { createdAt: { gte: startOfMonth } } }),
    ]);

    const conversionRate = totalOrgs > 0
      ? Math.round((activeOrgs / totalOrgs) * 100)
      : 0;

    res.json({
      totalOrgs,
      activeOrgs,
      trialOrgs,
      expiredOrgs,
      churnRisk,
      newThisMonth,
      conversionRate,
      revenue: {
        thisMonth: (monthRevenue._sum.amount || 0) / 100,
        lastMonth: (lastMonthRevenue._sum.amount || 0) / 100,
        total: (totalRevenue._sum.amount || 0) / 100,
      },
    });
  } catch (err) { next(err); }
});

// ─── GET /api/admin/restaurants ─────────────────────
router.get("/restaurants", requireAdmin, async (req, res, next) => {
  try {
    const { status, search, page = 1 } = req.query;
    const limit = 20;
    const skip = (parseInt(page) - 1) * limit;

    const where = {};
    if (status) where.planStatus = status;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { users: { some: { email: { contains: search, mode: "insensitive" } } } },
      ];
    }

    const [orgs, total] = await Promise.all([
      prisma.organization.findMany({
        where,
        include: {
          users: { select: { id: true, email: true, name: true, role: true } },
          _count: { select: { menuItems: true, orders: true, branches: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip,
      }),
      prisma.organization.count({ where }),
    ]);

    res.json({ orgs, total, pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
});

// ─── GET /api/admin/restaurant/:id ──────────────────
router.get("/restaurant/:id", requireAdmin, async (req, res, next) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.params.id },
      include: {
        users: { select: { id: true, email: true, name: true, role: true, createdAt: true } },
        branches: true,
        _count: { select: { menuItems: true, orders: true, views: true } },
        transactions: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    });
    if (!org) return res.status(404).json({ error: "Not found" });
    res.json(org);
  } catch (err) { next(err); }
});

// ─── POST /api/admin/restaurant/:id/set-plan ────────
router.post("/restaurant/:id/set-plan", requireAdmin, async (req, res, next) => {
  try {
    const { plan, planStatus, days } = req.body;
    const data = {};
    if (plan) data.plan = plan;
    if (planStatus) data.planStatus = planStatus;
    if (days) {
      data.currentPeriodEnd = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    }
    const updated = await prisma.organization.update({
      where: { id: req.params.id },
      data,
    });
    res.json({ ok: true, org: updated });
  } catch (err) { next(err); }
});

// ─── POST /api/admin/restaurant/:id/extend-trial ────
router.post("/restaurant/:id/extend-trial", requireAdmin, async (req, res, next) => {
  try {
    const { days = 7 } = req.body;
    const org = await prisma.organization.findUnique({ where: { id: req.params.id } });
    if (!org) return res.status(404).json({ error: "Not found" });

    const base = org.trialEndsAt && org.trialEndsAt > new Date()
      ? org.trialEndsAt
      : new Date();

    const trialEndsAt = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);

    await prisma.organization.update({
      where: { id: req.params.id },
      data: { trialEndsAt, planStatus: "TRIAL", plan: "TRIAL" },
    });

    res.json({ ok: true, trialEndsAt });
  } catch (err) { next(err); }
});

// ─── DELETE /api/admin/restaurant/:id ───────────────
router.delete("/restaurant/:id", requireAdmin, async (req, res, next) => {
  try {
    await prisma.organization.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─── GET /api/admin/sales-team ──────────────────────
router.get("/sales-team", requireAdmin, async (req, res, next) => {
  try {
    const salesUsers = await prisma.user.findMany({
      where: { role: "SALES" },
      include: { organization: { select: { name: true, slug: true } } },
    });

    // Her sales user için claim istatistikleri
    const result = await Promise.all(salesUsers.map(async (u) => {
      const [totalClaims, claimedCount] = await Promise.all([
        prisma.claimToken.count({ where: { sourceOrgId: u.organizationId } }),
        prisma.claimToken.count({ where: { sourceOrgId: u.organizationId, claimedAt: { not: null } } }),
      ]);
      return {
        id: u.id,
        email: u.email,
        name: u.name,
        orgName: u.organization?.name,
        orgSlug: u.organization?.slug,
        totalClaims,
        claimedCount,
        conversionRate: totalClaims > 0 ? Math.round((claimedCount / totalClaims) * 100) : 0,
      };
    }));

    res.json(result);
  } catch (err) { next(err); }
});

// ─── POST /api/admin/grant-sales ────────────────────
router.post("/grant-sales", requireAdmin, async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: "User not found" });
    await prisma.user.update({ where: { email }, data: { role: "SALES" } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─── POST /api/admin/revoke-sales ───────────────────
router.post("/revoke-sales", requireAdmin, async (req, res, next) => {
  try {
    const { email } = req.body;
    await prisma.user.update({ where: { email }, data: { role: "OWNER" } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─── GET /api/admin/revenue ─────────────────────────
router.get("/revenue", requireAdmin, async (req, res, next) => {
  try {
    const transactions = await prisma.transaction.findMany({
      where: { status: "PAID" },
      include: {
        organization: { select: { name: true, slug: true, plan: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    // Aylık gelir son 6 ay
    const monthly = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      const agg = await prisma.transaction.aggregate({
        where: { status: "PAID", createdAt: { gte: start, lte: end } },
        _sum: { amount: true },
      });
      monthly.push({
        month: start.toLocaleString("en", { month: "short", year: "numeric" }),
        amount: (agg._sum.amount || 0) / 100,
      });
    }

    res.json({ transactions, monthly });
  } catch (err) { next(err); }
});

// ─── GET /api/admin/error-logs ──────────────────────
router.get("/error-logs", requireAdmin, async (req, res, next) => {
  try {
    const logs = await prisma.errorLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    res.json(logs);
  } catch (err) {
    // ErrorLog tablosu yoksa boş döndür
    res.json([]);
  }
});

module.exports = router;
