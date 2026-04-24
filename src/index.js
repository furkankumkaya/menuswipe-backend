// src/index.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const authRoutes = require("./routes/auth");
const menuRoutes = require("./routes/menu");
const branchRoutes = require("./routes/branches");
const stripeRoutes = require("./routes/stripe");
const qrRoutes = require("./routes/qr");
const publicRoutes = require("./routes/public");

const app = express();

// Stripe webhook needs raw body
app.use("/api/stripe/webhook", express.raw({ type: "application/json" }));

app.use(cors({ origin: "*" }));
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, "../public")));

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/menu", menuRoutes);
app.use("/api/branches", branchRoutes);
app.use("/api/stripe", stripeRoutes);
app.use("/api/qr", qrRoutes);
app.use("/api/public", publicRoutes);

// Health check
app.get("/health", (_, res) => res.json({ ok: true }));

// Serve admin panel
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/admin.html"));
});

// Serve customer menu
app.get("/menu/:slug", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/menu.html"));
});

// Fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`MenuSwipe running on port ${PORT}`));
