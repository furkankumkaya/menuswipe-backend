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
        console.log(`[seed] password reset: ${email}`);
      } else {
        const name = email.split("@")[0];
        let slug = name.toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 40);
        const exists = await prisma.organization.findUnique({ where: { slug } });
        if (exists) slug = slug + "-" + Date.now();

        await prisma.organization.create({
          data: {
            name, slug, currency: "USD", defaultLanguage: "en", enabledLanguages: [],
            plan: "TRIAL", subscriptionStatus: "TRIAL",
            trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            onboardingCompleted: false,
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
