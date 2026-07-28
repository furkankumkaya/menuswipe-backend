const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "30d" });
}

function slugify(str) {
  return str.toLowerCase()
    .replace(/ğ/g,"g").replace(/ü/g,"u").replace(/ş/g,"s")
    .replace(/ı/g,"i").replace(/ö/g,"o").replace(/ç/g,"c")
    .replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 40);
}

async function uniqueSlug(base) {
  let slug = slugify(base) || "restaurant";
  let exists = await prisma.organization.findUnique({ where: { slug } });
  let i = 2;
  while (exists) { slug = slugify(base) + "-" + i++; exists = await prisma.organization.findUnique({ where: { slug } }); }
  return slug;
}

// Middleware: require sales token
async function requireSales(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) return res.status(401).json({ error: "No token" });
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({ where: { id: payload.userId }, include: { organization: true } });
    if (!user || user.role !== "SALES") return res.status(401).json({ error: "Not a sales user" });
    req.user = user;
    req.org = user.organization;
    next();
  } catch (e) { return res.status(401).json({ error: "Invalid token" }); }
}

// ── LOGIN ────────────────────────────────────────────
router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.role !== "SALES") return res.status(401).json({ error: "Invalid credentials or not a sales account" });
    if (!(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ error: "Invalid email or password" });

    const token = signToken(user.id);
    res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) { next(err); }
});

// ── REGISTER (apply) ────────────────────────────────
router.post("/register", async (req, res, next) => {
  try {
    const { name, email, phone, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: "Name, email and password required" });
    if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

    // Check if already applied or user exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) return res.status(409).json({ error: "This email is already registered" });

    const existingApp = await prisma.salesApplication.findUnique({ where: { email } });
    if (existingApp) return res.status(409).json({ error: "Application already submitted" });

    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.salesApplication.create({
      data: { name, email, phone: phone || null, passwordHash, status: "PENDING" },
    });

    res.status(201).json({ ok: true });
  } catch (err) { next(err); }
});

// ── DASHBOARD ────────────────────────────────────────
router.get("/dashboard", requireSales, async (req, res, next) => {
  try {
    const demos = await prisma.salesDemo.findMany({
      where: { salesUserId: req.user.id },
      orderBy: { createdAt: "desc" },
    });

    // Enrich with org data
    const orgIds = demos.map(d => d.organizationId);
    const orgs = await prisma.organization.findMany({
      where: { id: { in: orgIds } },
      select: { id: true, name: true, slug: true, plan: true, subscriptionStatus: true, trialEndsAt: true, city: true, country: true, _count: { select: { menuItems: true } } },
    });
    const orgMap = {};
    orgs.forEach(o => { orgMap[o.id] = { ...o, menuItems: o._count.menuItems }; });

    const enriched = demos.map(d => ({
      ...d,
      org: orgMap[d.organizationId] || null,
    }));

    const totalDemos = demos.length;
    const claimedDemos = demos.filter(d => d.status !== "CREATED").length;
    const subscribedDemos = demos.filter(d => d.status === "SUBSCRIBED").length;
    const conversionRate = totalDemos > 0 ? Math.round((claimedDemos / totalDemos) * 100) : 0;

    res.json({
      demos: enriched,
      stats: { totalDemos, claimedDemos, subscribedDemos, conversionRate },
      balance: { total: 0, pending: 0 }, // placeholder until payment integration
    });
  } catch (err) { next(err); }
});

// ── COMMISSIONS ──────────────────────────────────────
router.get("/commissions", requireSales, async (req, res) => {
  res.json([]); // placeholder
});

// ── CREATE DEMO ──────────────────────────────────────
router.post("/create-demo", requireSales, async (req, res, next) => {
  try {
    const name = (req.body.restaurantName || "").trim() || "Demo Restaurant";
    const slug = await uniqueSlug(name);
    const trialEndsAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000); // 15 day trial for demos

    const org = await prisma.organization.create({
      data: {
        name, slug, currency: "USD", defaultLanguage: "en", enabledLanguages: [],
        plan: "TRIAL", subscriptionStatus: "TRIAL", trialEndsAt,
        onboardingCompleted: false,
        qrSecret: crypto.randomBytes(16).toString("hex"),
        // Create a placeholder user for the org (sales-managed)
        users: { create: { email: `demo-${slug}@menuswipe.local`, passwordHash: "SALES_MANAGED", name, role: "PLACEHOLDER" } },
        branches: { create: { name, slug: "main", active: true } },
      },
      include: { users: true },
    });

    // Track demo
    await prisma.salesDemo.create({
      data: { salesUserId: req.user.id, organizationId: org.id, orgName: name, status: "CREATED" },
    });

    // Generate editor token for the placeholder user
    const editorToken = signToken(org.users[0].id);

    res.status(201).json({
      editorToken,
      organization: { id: org.id, name: org.name, slug: org.slug },
    });
  } catch (err) { next(err); }
});

// ── DEMO TOKEN (re-enter editor) ─────────────────────
router.get("/demo-token/:orgId", requireSales, async (req, res, next) => {
  try {
    const demo = await prisma.salesDemo.findFirst({
      where: { salesUserId: req.user.id, organizationId: req.params.orgId },
    });
    if (!demo) return res.status(404).json({ error: "Demo not found" });

    const user = await prisma.user.findFirst({ where: { organizationId: req.params.orgId } });
    if (!user) return res.status(404).json({ error: "No user for this org" });

    res.json({ token: signToken(user.id) });
  } catch (err) { next(err); }
});

// ── GENERATE CLAIM LINK ──────────────────────────────
router.post("/generate-claim/:orgId", requireSales, async (req, res, next) => {
  try {
    const demo = await prisma.salesDemo.findFirst({
      where: { salesUserId: req.user.id, organizationId: req.params.orgId },
    });
    if (!demo) return res.status(404).json({ error: "Demo not found" });

    const claimToken = crypto.randomBytes(16).toString("hex");
    const baseUrl = process.env.APP_URL || "https://menu-swipe.com";
    const claimUrl = `${baseUrl}/claim/${claimToken}`;

    await prisma.salesDemo.update({
      where: { id: demo.id },
      data: { claimToken, claimUrl },
    });

    res.json({ claimUrl });
  } catch (err) { next(err); }
});

// ── CLAIM: Validate token (public, no auth) ────────
router.get("/claim/:token", async (req, res, next) => {
  try {
    const demo = await prisma.salesDemo.findUnique({ where: { claimToken: req.params.token } });
    if (!demo) return res.status(404).json({ error: "This claim link is invalid or has expired." });
    if (demo.status !== "CREATED") return res.status(400).json({ error: "This menu has already been claimed." });

    const org = await prisma.organization.findUnique({ where: { id: demo.organizationId } });
    if (!org) return res.status(404).json({ error: "Restaurant not found." });

    res.json({ restaurantName: org.name, menuItems: await prisma.menuItem.count({ where: { organizationId: org.id } }) });
  } catch (err) { next(err); }
});

// ── CLAIM: Create account & transfer ownership (public, no auth) ──
router.post("/claim/:token", async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    if (!email || !email.includes("@")) return res.status(400).json({ error: "Valid email required" });
    if (!password || password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

    const demo = await prisma.salesDemo.findUnique({ where: { claimToken: req.params.token } });
    if (!demo) return res.status(404).json({ error: "Invalid claim link." });
    if (demo.status !== "CREATED") return res.status(400).json({ error: "This menu has already been claimed." });

    // Check if email already in use
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(400).json({ error: "An account with this email already exists. Please use a different email." });

    const passwordHash = await bcrypt.hash(password, 10);
    const orgId = demo.organizationId;

    // Replace placeholder user with the real owner
    const placeholders = await prisma.user.findMany({ where: { organizationId: orgId, role: "PLACEHOLDER" } });
    for (const ph of placeholders) {
      await prisma.user.delete({ where: { id: ph.id } });
    }

    const user = await prisma.user.create({
      data: { email, passwordHash, name: name || email.split("@")[0], role: "OWNER", organizationId: orgId },
    });

    // Update org name if the owner provides a different name
    await prisma.organization.update({
      where: { id: orgId },
      data: {
        trialEndsAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // Reset 15-day trial from claim date
      },
    });

    // Mark demo as claimed
    await prisma.salesDemo.update({
      where: { id: demo.id },
      data: { status: "CLAIMED", claimedByUserId: user.id, claimedAt: new Date() },
    });

    const org = await prisma.organization.findUnique({ where: { id: orgId } });
    const token = signToken(user.id);

    res.json({ token, organization: { id: org.id, name: org.name, slug: org.slug } });
  } catch (err) { next(err); }
});

module.exports = router;
