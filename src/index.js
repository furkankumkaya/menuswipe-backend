require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

// Kritik env var kontrolü
if (!process.env.JWT_SECRET) {
  console.error("FATAL: JWT_SECRET environment variable is not set!");
  process.exit(1);
}

const authRoutes = require("./routes/auth");
const menuRoutes = require("./routes/menu");
const branchRoutes = require("./routes/branches");
const stripeRoutes = require("./routes/stripe");
const qrRoutes = require("./routes/qr");
const publicRoutes = require("./routes/public");
const analyticsRoutes = require("./routes/analytics");
const categoriesRoutes = require("./routes/categories");
const subscriptionRoutes = require("./routes/subscription");
const importRoutes = require("./routes/import");
const tablesRoutes = require("./routes/tables");
const ordersRoutes = require("./routes/orders");
const googleInsightsRoutes = require("./routes/google-insights");
const translationsRoutes = require("./routes/translations");

const app = express();

app.use("/api/stripe/webhook", express.raw({ type: "application/json" }));
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "5mb" }));
app.use(express.static(path.join(__dirname, "../public")));
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

app.use("/api/auth", authRoutes);
app.use("/api/menu", menuRoutes);
app.use("/api/branches", branchRoutes);
app.use("/api/categories", categoriesRoutes);
app.use("/api/subscription", subscriptionRoutes);
app.use("/api/import", importRoutes);
app.use("/api/translations", translationsRoutes);
app.use("/api/stripe", stripeRoutes);
app.use("/api/qr", qrRoutes);
app.use("/api/tables", tablesRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/google-insights", googleInsightsRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/analytics", analyticsRoutes);

app.get("/health", (_, res) => res.json({ ok: true }));

app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, "../public/admin.html")));
app.get("/menu/:slug", (req, res) => res.sendFile(path.join(__dirname, "../public/menu.html")));
app.get("/menu/:slug/:branchSlug", (req, res) => res.sendFile(path.join(__dirname, "../public/menu.html")));

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "../public/index.html")));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MenuSwipe running on port ${PORT}`);
  seedBetaAccounts().catch(e => console.error("[seed] failed:", e.message));
  backfillQrSecrets().catch(e => console.error("[backfill] qrSecret failed:", e.message));
  backfillCategoryGroups().catch(e => console.error("[backfill] category groups failed:", e.message));
});

// Beta hesaplarını otomatik oluştur/güncelle
async function seedBetaAccounts() {
  const bcrypt = require("bcryptjs");
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();

  const BETA_EMAILS = (process.env.BETA_EMAILS || "").split(",").map(e => e.trim()).filter(Boolean);
  const SEED_PASSWORD = process.env.BETA_GRANT_SECRET || "MenuSwipe2026";

  for (const email of BETA_EMAILS) {
    try {
      const existing = await prisma.user.findUnique({ where: { email } });
      const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);

      if (existing) {
        await prisma.user.update({ where: { email }, data: { passwordHash } });
        // Beta hesaplarini kalici PRO yap
        await prisma.organization.update({
          where: { id: existing.organizationId },
          data: {
            plan: "PRO",
            subscriptionStatus: "ACTIVE",
            billingCycle: "YEARLY",
            subscriptionEndsAt: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000),
          },
        });
        console.log(`[seed] password reset + PRO granted: ${email}`);
      } else {
        const name = "My Restaurant";
        let slug = "restaurant";
        const exists = await prisma.organization.findUnique({ where: { slug } });
        if (exists) slug = slug + "-" + Date.now();

        const crypto = require("crypto");
        await prisma.organization.create({
          data: {
            name, slug, currency: "USD", defaultLanguage: "en", enabledLanguages: [],
            plan: "PRO", subscriptionStatus: "ACTIVE",
            billingCycle: "YEARLY",
            subscriptionEndsAt: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000),
            onboardingCompleted: false,
            qrSecret: crypto.randomBytes(16).toString("hex"),
            users: { create: { email, passwordHash, name, role: "OWNER" } },
            branches: { create: { name, slug: "main", active: true } },
          },
        });
        console.log(`[seed] account created: ${email}`);
      }
    } catch (e) {
      console.error(`[seed] error for ${email}:`, e.message);
    }
  }
  await prisma.$disconnect();
}

// Backfill category groups for existing categories that still have default "food"
async function backfillCategoryGroups() {
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();

  const DRINK_KW = ['drink','beer','wine','cocktail','coffee','tea','juice','soda','water','smoothie','shake','lemonade','icecek','bira','sarap','kahve','cay','su','mocktail','spirits','soft','beverage'];
  const DESSERT_KW = ['dessert','sweet','cake','ice cream','pastry','chocolate','cookie','brownie','tiramisu','cheesecake','tatli','dondurma','baklava','kunefe','sorbet','gelato','macaron','waffle','pancake','crepe','sufle','souffle','profiterol'];

  function classify(code, label) {
    const text = (code + ' ' + label).toLowerCase();
    if (DRINK_KW.some(k => text.includes(k))) return 'drinks';
    if (DESSERT_KW.some(k => text.includes(k))) return 'dessert';
    return 'food';
  }

  try {
    const cats = await prisma.category.findMany({ where: { group: "food" } });
    let updated = 0;
    for (const c of cats) {
      const g = classify(c.code, c.label);
      if (g !== "food") {
        await prisma.category.update({ where: { id: c.id }, data: { group: g } });
        updated++;
      }
    }
    if (updated > 0) console.log(`[backfill] category groups updated: ${updated}`);
  } catch (e) {
    console.error("[backfill] category groups error:", e.message);
  }
  await prisma.$disconnect();
}

// Existing orgs missing qrSecret: backfill
async function backfillQrSecrets() {
  const crypto = require("crypto");
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const orgs = await prisma.organization.findMany({ where: { qrSecret: null } });
    for (const org of orgs) {
      await prisma.organization.update({
        where: { id: org.id },
        data: { qrSecret: crypto.randomBytes(16).toString("hex") },
      });
      console.log(`[backfill] qrSecret set for org: ${org.name} (${org.slug})`);
    }
  } catch (e) {
    console.error("[backfill] error:", e.message);
  }
  await prisma.$disconnect();
}
