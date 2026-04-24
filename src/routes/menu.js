// src/routes/menu.js
const router = require("express").Router();
const multer = require("multer");
const sharp = require("sharp");
const path = require("path");
const fs = require("fs");
const { v4: uuid } = require("uuid");
const { PrismaClient } = require("@prisma/client");
const { requireAuth } = require("../middleware/auth");

const prisma = new PrismaClient();

// ─── Multer config ───────────────────────────────────
const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"));
    }
    cb(null, true);
  },
});

// ─── GET /api/menu ───────────────────────────────────
// Returns all menu items for the organization
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const items = await prisma.menuItem.findMany({
      where: { organizationId: req.org.id, branchId: null },
      include: { photos: { orderBy: { sortOrder: "asc" } } },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
    });
    res.json(items);
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/menu ──────────────────────────────────
router.post("/", requireAuth, async (req, res, next) => {
  try {
    const { name, description, price, category } = req.body;
    if (!name || price === undefined) {
      return res.status(400).json({ error: "name and price are required" });
    }

    const item = await prisma.menuItem.create({
      data: {
        organizationId: req.org.id,
        name,
        description,
        price: parseFloat(price),
        category: category || "MAIN",
      },
      include: { photos: true },
    });
    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/menu/:id ─────────────────────────────
router.patch("/:id", requireAuth, async (req, res, next) => {
  try {
    const item = await prisma.menuItem.findFirst({
      where: { id: req.params.id, organizationId: req.org.id },
    });
    if (!item) return res.status(404).json({ error: "Item not found" });

    const { name, description, price, category, active, sortOrder } = req.body;
    const updated = await prisma.menuItem.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(price !== undefined && { price: parseFloat(price) }),
        ...(category !== undefined && { category }),
        ...(active !== undefined && { active }),
        ...(sortOrder !== undefined && { sortOrder }),
      },
      include: { photos: { orderBy: { sortOrder: "asc" } } },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /api/menu/:id ────────────────────────────
router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const item = await prisma.menuItem.findFirst({
      where: { id: req.params.id, organizationId: req.org.id },
      include: { photos: true },
    });
    if (!item) return res.status(404).json({ error: "Item not found" });

    // Delete photo files
    item.photos.forEach((p) => {
      const filePath = path.join(UPLOAD_DIR, path.basename(p.url));
      fs.unlink(filePath, () => {});
    });

    await prisma.menuItem.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/menu/:id/photos ───────────────────────
// Upload a photo for a menu item (max 3 enforced here)
router.post(
  "/:id/photos",
  requireAuth,
  upload.single("photo"),
  async (req, res, next) => {
    try {
      const item = await prisma.menuItem.findFirst({
        where: { id: req.params.id, organizationId: req.org.id },
        include: { photos: true },
      });
      if (!item) return res.status(404).json({ error: "Item not found" });

      if (item.photos.length >= 3) {
        return res.status(400).json({ error: "Maximum 3 photos per item" });
      }

      if (!req.file) return res.status(400).json({ error: "No file uploaded" });

      // Resize & convert to webp for performance
      const filename = `${uuid()}.webp`;
      const dest = path.join(UPLOAD_DIR, filename);
      await sharp(req.file.buffer)
        .resize(1080, 1920, { fit: "cover" })
        .webp({ quality: 85 })
        .toFile(dest);

      const photo = await prisma.menuPhoto.create({
        data: {
          menuItemId: item.id,
          url: `/uploads/${filename}`,
          sortOrder: item.photos.length,
        },
      });
      res.status(201).json(photo);
    } catch (err) {
      next(err);
    }
  }
);

// ─── DELETE /api/menu/:id/photos/:photoId ────────────
router.delete("/:id/photos/:photoId", requireAuth, async (req, res, next) => {
  try {
    const photo = await prisma.menuPhoto.findFirst({
      where: { id: req.params.photoId, menuItemId: req.params.id },
    });
    if (!photo) return res.status(404).json({ error: "Photo not found" });

    const filePath = path.join(UPLOAD_DIR, path.basename(photo.url));
    fs.unlink(filePath, () => {});
    await prisma.menuPhoto.delete({ where: { id: photo.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/menu/:id/photos/reorder ─────────────
router.patch("/:id/photos/reorder", requireAuth, async (req, res, next) => {
  try {
    const { order } = req.body; // array of photo IDs in desired order
    await Promise.all(
      order.map((photoId, idx) =>
        prisma.menuPhoto.update({
          where: { id: photoId },
          data: { sortOrder: idx },
        })
      )
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
