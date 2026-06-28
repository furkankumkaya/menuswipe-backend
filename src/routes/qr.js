// src/routes/qr.js
const router = require("express").Router();
const QRCode = require("qrcode");
const { PrismaClient } = require("@prisma/client");
const { requireAuth } = require("../middleware/auth");
const fs = require("fs");
const path = require("path");
const { v4: uuid } = require("uuid");

const prisma = new PrismaClient();
const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";

// ─── GET /api/qr/:branchId ───────────────────────────
// Generate QR code for a branch and return as base64 PNG
router.get("/:branchId", requireAuth, async (req, res, next) => {
  try {
    const branch = await prisma.branch.findFirst({
      where: { id: req.params.branchId, organizationId: req.org.id },
    });
    if (!branch) return res.status(404).json({ error: "Branch not found" });

    const { color = "#1a1a1a", bg = "#ffffff", size = "400" } = req.query;
    const menuUrl = `${process.env.MENU_BASE_URL}/${req.org.slug}/${branch.slug}`;

    const qrOptions = {
      type: "image/png",
      width: Math.min(parseInt(size) || 400, 1000),
      margin: 2,
      color: {
        dark: color,
        light: bg,
      },
      errorCorrectionLevel: "H", // High — allows logo overlay
    };

    const base64 = await QRCode.toDataURL(menuUrl, qrOptions);
    res.json({ base64, url: menuUrl });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/qr/:branchId/save ────────────────────
// Generate + save QR PNG to disk, store path on branch
router.post("/:branchId/save", requireAuth, async (req, res, next) => {
  try {
    const branch = await prisma.branch.findFirst({
      where: { id: req.params.branchId, organizationId: req.org.id },
    });
    if (!branch) return res.status(404).json({ error: "Branch not found" });

    const menuUrl = `${process.env.MENU_BASE_URL}/${req.org.slug}/${branch.slug}`;
    const filename = `qr-${req.org.slug}-${branch.slug}-${uuid()}.png`;
    const dest = path.join(UPLOAD_DIR, filename);
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });

    await QRCode.toFile(dest, menuUrl, {
      width: 800,
      margin: 2,
      color: { dark: "#1a1a1a", light: "#ffffff" },
      errorCorrectionLevel: "H",
    });

    const qrCodeUrl = `/uploads/${filename}`;
    await prisma.branch.update({
      where: { id: branch.id },
      data: { qrCodeUrl },
    });

    res.json({ qrCodeUrl, url: menuUrl });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/qr/:branchId/svg ──────────────────────
// Return QR as SVG string
router.get("/:branchId/svg", requireAuth, async (req, res, next) => {
  try {
    const branch = await prisma.branch.findFirst({
      where: { id: req.params.branchId, organizationId: req.org.id },
    });
    if (!branch) return res.status(404).json({ error: "Branch not found" });

    const menuUrl = `${process.env.MENU_BASE_URL}/${req.org.slug}/${branch.slug}`;
    const svg = await QRCode.toString(menuUrl, {
      type: "svg",
      margin: 2,
      color: { dark: req.query.color || "#1a1a1a", light: req.query.bg || "#ffffff" },
      errorCorrectionLevel: "H",
    });

    res.setHeader("Content-Type", "image/svg+xml");
    res.send(svg);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
