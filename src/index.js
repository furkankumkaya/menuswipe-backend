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

// Stripe webhook needs raw body — mount BEFORE json middleware
app.use("/api/stripe/webhook", express.raw({ type: "application/json" }));

app.use(cors({ origin: process.env.APP_URL || "*" }));
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/menu", menuRoutes);
app.use("/api/branches", branchRoutes);
app.use("/api/stripe", stripeRoutes);
app.use("/api/qr", qrRoutes);
app.use("/api/public", publicRoutes); // unauthenticated — customer-facing menu

// Health check
app.get("/health", (_, res) => res.json({ ok: true }));

// Global error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`MenuSwipe running on port ${PORT}`));
