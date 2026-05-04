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
const translationsRoutes = require("./routes/translations");

const app = express();

app.use("/api/stripe/webhook", express.raw({ type: "application/json" }));
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "5mb" }));
app.use(express.static(path.join(__dirname, "../public")));

app.use("/api/auth", authRoutes);
app.use("/api/menu", menuRoutes);
app.use("/api/branches", branchRoutes);
app.use("/api/categories", categoriesRoutes);
app.use("/api/subscription", subscriptionRoutes);
app.use("/api/import", importRoutes);
app.use("/api/translations", translationsRoutes);
app.use("/api/stripe", stripeRoutes);
app.use("/api/qr", qrRoutes);
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
app.listen(PORT, () => console.log(`MenuSwipe running on port ${PORT}`));
