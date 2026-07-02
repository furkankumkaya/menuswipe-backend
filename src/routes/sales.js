// src/routes/sales.js - Sales person endpoints
const router = require("express").Router();
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");
const { signAuthToken, verifyAuthToken } = require("../utils/jwt");

const prisma = new PrismaClient();

// ─── Sales auth middleware ───────────────────────────
async function requireSales(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "No token" });

    const payload = verifyAuthToken(token);
    
    // orgOverride destegi - sales kisi demo org'a erisirken
    if (payload.orgOverride) {
      const user = await prisma.user.findUnique({ where: { id: payload.userId } });
      if (!user || user.role !== "SALES") return res.status(403).json({ error: "Not a sales user" });
      const org = await prisma.organization.findUnique({ where: { id: payload.orgOverride } });
      if (!org) return res.status(404).json({ error: "Organization not found" });
      req.user = user;
      req.org = org;
      return next();
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { organization: true },
    });
    if (!user) return res.status(401).json({ error: "User not found" });
    if (user.role !== "SALES" && user.role !== "ADMIN") {
      return res.status(403).json({ error: "Sales access required" });
    }
    req.user = user;
    req.org = user.organization;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// ─── POST /api/sales/register ────────────────────────
// Sales basvurusu - admin onayina duser
router.post("/register", async (req, res, next) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email and password required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    // Email zaten var mi?
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) return res.status(409).json({ error: "This email is already registered" });

    const existingApp = await prisma.salesApplication.findUnique({ where: { email } });
    if (existingApp) {
      if (existingApp.status === "PENDING") return res.status(409).json({ error: "Application already submitted, waiting for approval" });
      if (existingApp.status === "REJECTED") return res.status(409).json({ error: "Application was previously rejected" });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.salesApplication.create({
      data: { email, name, passwordHash, phone, status: "PENDING" },
    });

    res.status(201).json({ ok: true, message: "Application submitted. You'll be notified when approved." });
  } catch (err) { next(err); }
});

// ─── POST /api/sales/login ───────────────────────────
router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });

    const user = await prisma.user.findUnique({
      where: { email },
      include: { organization: true },
    });

    if (!user || user.role !== "SALES") {
      // Belki henuz onaylanmamis bir basvuru var?
      const app = await prisma.salesApplication.findUnique({ where: { email } });
      if (app && app.status === "PENDING") {
        return res.status(403).json({ error: "Your application is still pending approval" });
      }
      if (app && app.status === "REJECTED") {
        return res.status(403).json({ error: "Your application was rejected" });
      }
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: "Invalid email or password" });

    const token = signAuthToken(user.id);
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      organization: { id: user.organization.id, name: user.organization.name },
    });
  } catch (err) { next(err); }
});

// ─── GET /api/sales/me ──────────────────────────────
router.get("/me", requireSales, (req, res) => {
  res.json({
    id: req.user.id,
    name: req.user.name,
    email: req.user.email,
    role: req.user.role,
  });
});

// ─── GET /api/sales/dashboard ────────────────────────
router.get("/dashboard", requireSales, async (req, res, next) => {
  try {
    const demos = await prisma.salesDemo.findMany({
      where: { salesUserId: req.user.id },
      orderBy: { createdAt: "desc" },
    });

    // Her demo icin org bilgisi ve subscription durumunu cek
    const enriched = await Promise.all(demos.map(async (d) => {
      const org = await prisma.organization.findUnique({
        where: { id: d.organizationId },
        select: {
          name: true, slug: true, plan: true, planStatus: true,
          trialEndsAt: true, createdAt: true, city: true, country: true,
          _count: { select: { menuItems: true } },
        },
      });

      let displayStatus = d.status;
      if (org) {
        if (org.planStatus === "ACTIVE" && org.plan !== "TRIAL") displayStatus = "SUBSCRIBED";
        else if (org.planStatus === "TRIAL") displayStatus = "TRIAL";
        else if (org.planStatus === "EXPIRED") displayStatus = "CHURNED";
      }

      // Demo'nun durumunu guncelle
      if (displayStatus !== d.status) {
        await prisma.salesDemo.update({ where: { id: d.id }, data: { status: displayStatus } });
      }

      return {
        ...d,
        status: displayStatus,
        org: org ? {
          name: org.name, slug: org.slug, plan: org.plan,
          planStatus: org.planStatus, trialEndsAt: org.trialEndsAt,
          city: org.city, country: org.country,
          menuItems: org._count.menuItems, createdAt: org.createdAt,
        } : null,
      };
    }));

    // Komisyon bilgisi
    const [totalCommission, pendingCommission] = await Promise.all([
      prisma.commission.aggregate({
        where: { salesUserId: req.user.id },
        _sum: { amount: true },
      }),
      prisma.commission.aggregate({
        where: { salesUserId: req.user.id, status: "PENDING" },
        _sum: { amount: true },
      }),
    ]);

    const totalDemos = demos.length;
    const claimedDemos = demos.filter(d => d.status !== "CREATED").length;
    const subscribedDemos = enriched.filter(d => d.status === "SUBSCRIBED").length;

    res.json({
      demos: enriched,
      stats: {
        totalDemos,
        claimedDemos,
        subscribedDemos,
        conversionRate: totalDemos > 0 ? Math.round((claimedDemos / totalDemos) * 100) : 0,
      },
      balance: {
        total: (totalCommission._sum.amount || 0) / 100,
        pending: (pendingCommission._sum.amount || 0) / 100,
        currency: "USD",
      },
    });
  } catch (err) { next(err); }
});

// ─── POST /api/sales/create-demo ─────────────────────
// Yeni demo restoran olustur, token dondur
router.post("/create-demo", requireSales, async (req, res, next) => {
  try {
    const { restaurantName, googleMapsUrl } = req.body;
    if (!restaurantName) return res.status(400).json({ error: "Restaurant name required" });

    function slugify(str) {
      return str.toLowerCase()
        .replace(/ğ/g,"g").replace(/ü/g,"u").replace(/ş/g,"s")
        .replace(/ı/g,"i").replace(/ö/g,"o").replace(/ç/g,"c")
        .replace(/\s+/g,"-").replace(/[^a-z0-9-]/g,"").slice(0,40);
    }

    let slug = slugify(restaurantName) || "demo-restaurant";
    const existing = await prisma.organization.findUnique({ where: { slug } });
    if (existing) slug = slug + "-" + Date.now().toString().slice(-4);

    // Demo org olustur (PRO, onboarding tamamlanmamis)
    const org = await prisma.organization.create({
      data: {
        name: restaurantName,
        slug,
        currency: "USD",
        defaultLanguage: "en",
        enabledLanguages: [],
        plan: "PRO",
        planStatus: "ACTIVE",
        currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        onboardingCompleted: false,
        referredBySalesUserId: req.user.id,
        googleMapsUrl: googleMapsUrl || null,
        branches: {
          create: { name: restaurantName, slug: "main", active: true },
        },
      },
    });

    // SalesDemo kaydi
    await prisma.salesDemo.create({
      data: {
        salesUserId: req.user.id,
        organizationId: org.id,
        orgName: restaurantName,
        status: "CREATED",
      },
    });

    // Demo org icin ozel token (orgOverride ile)
    const demoToken = signAuthToken(req.user.id, { orgOverride: org.id });

    res.json({
      ok: true,
      organization: { id: org.id, name: org.name, slug: org.slug },
      editorToken: demoToken,
      editorUrl: `/editor.html?salesMode=true&orgId=${org.id}`,
    });
  } catch (err) { next(err); }
});

// ─── POST /api/sales/generate-claim/:orgId ───────────
// Demo restoran icin claim link uret
router.post("/generate-claim/:orgId", requireSales, async (req, res, next) => {
  try {
    const orgId = req.params.orgId;

    // Bu org'un bu sales kisiye ait olup olmadigini kontrol et
    const demo = await prisma.salesDemo.findFirst({
      where: { salesUserId: req.user.id, organizationId: orgId },
    });
    if (!demo) return res.status(403).json({ error: "Not your demo" });

    // Eski token'lari temizle
    await prisma.claimToken.deleteMany({
      where: { sourceOrgId: orgId, claimedAt: null, expiresAt: { lt: new Date() } },
    });

    const token = crypto.randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 gun

    await prisma.claimToken.create({
      data: {
        token,
        sourceOrgId: orgId,
        salesUserId: req.user.id,
        expiresAt,
      },
    });

    const claimUrl = `${process.env.APP_URL}/claim/${token}`;

    // SalesDemo'yu guncelle
    await prisma.salesDemo.update({
      where: { id: demo.id },
      data: { claimToken: token, claimUrl },
    });

    res.json({ token, claimUrl, expiresAt });
  } catch (err) { next(err); }
});

// ─── GET /api/sales/demo-token/:orgId ────────────────
// Demo org icin editor erisim token'i al
router.get("/demo-token/:orgId", requireSales, async (req, res, next) => {
  try {
    const demo = await prisma.salesDemo.findFirst({
      where: { salesUserId: req.user.id, organizationId: req.params.orgId },
    });
    if (!demo) return res.status(403).json({ error: "Not your demo" });

    const demoToken = signAuthToken(req.user.id, { orgOverride: req.params.orgId });
    res.json({ token: demoToken });
  } catch (err) { next(err); }
});

// ─── GET /api/sales/commissions ──────────────────────
router.get("/commissions", requireSales, async (req, res, next) => {
  try {
    const commissions = await prisma.commission.findMany({
      where: { salesUserId: req.user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    // Her komisyon icin org bilgisi
    const enriched = await Promise.all(commissions.map(async (c) => {
      const org = await prisma.organization.findUnique({
        where: { id: c.organizationId },
        select: { name: true, plan: true },
      });
      return { ...c, orgName: org?.name || "Unknown", plan: org?.plan };
    }));

    res.json(enriched);
  } catch (err) { next(err); }
});

module.exports = router;
