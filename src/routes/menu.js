// src/routes/menu.js
const router = require("express").Router();
const multer = require("multer");
const { PrismaClient } = require("@prisma/client");
const { requireAuth } = require("../middleware/auth");
const cloudinary = require("cloudinary").v2;
const streamifier = require("streamifier");

const prisma = new PrismaClient();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (!file.mimetype.startsWith("image/")) return cb(new Error("Only image files allowed"));
    cb(null, true);
  },
});

function uploadToCloudinary(buffer, folder) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `menuswipe/${folder}`,
        transformation: [
          { width: 1080, height: 1920, crop: "fill", gravity: "auto" },
          { quality: "auto:good", fetch_format: "auto" },
        ],
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
}

// GET /api/menu
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const items = await prisma.menuItem.findMany({
      where: { organizationId: req.org.id, branchId: null },
      include: { photos: { orderBy: { sortOrder: "asc" } } },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
    });
    res.json(items);
  } catch (err) { next(err); }
});

// POST /api/menu
router.post("/", requireAuth, async (req, res, next) => {
  try {
    const { name, description, price, category } = req.body;
    if (!name || price === undefined) return res.status(400).json({ error: "name and price required" });
    const item = await prisma.menuItem.create({
      data: { organizationId: req.org.id, name, description, price: parseFloat(price), category: category || "MAIN" },
      include: { photos: true },
    });
    res.status(201).json(item);
  } catch (err) { next(err); }
});

// PATCH /api/menu/:id
router.patch("/:id", requireAuth, async (req, res, next) => {
  try {
    const item = await prisma.menuItem.findFirst({ where: { id: req.params.id, organizationId: req.org.id } });
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
  } catch (err) { next(err); }
});

// DELETE /api/menu/:id
router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const item = await prisma.menuItem.findFirst({
      where: { id: req.params.id, organizationId: req.org.id },
      include: { photos: true },
    });
    if (!item) return res.status(404).json({ error: "Item not found" });
    for (const photo of item.photos) {
      if (photo.cloudinaryId) await cloudinary.uploader.destroy(photo.cloudinaryId).catch(() => {});
    }
    await prisma.menuItem.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/menu/:id/photos
router.post("/:id/photos", requireAuth, upload.single("photo"), async (req, res, next) => {
  try {
    const item = await prisma.menuItem.findFirst({
      where: { id: req.params.id, organizationId: req.org.id },
      include: { photos: true },
    });
    if (!item) return res.status(404).json({ error: "Item not found" });
    if (item.photos.length >= 3) return res.status(400).json({ error: "Maximum 3 photos per item" });
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const result = await uploadToCloudinary(req.file.buffer, `${req.org.id}/${req.params.id}`);

    const photo = await prisma.menuPhoto.create({
      data: {
        menuItemId: item.id,
        url: result.secure_url,
        cloudinaryId: result.public_id,
        sortOrder: item.photos.length,
      },
    });
    res.status(201).json(photo);
  } catch (err) { next(err); }
});

// DELETE /api/menu/:id/photos/:photoId
router.delete("/:id/photos/:photoId", requireAuth, async (req, res, next) => {
  try {
    const photo = await prisma.menuPhoto.findFirst({ where: { id: req.params.photoId, menuItemId: req.params.id } });
    if (!photo) return res.status(404).json({ error: "Photo not found" });
    if (photo.cloudinaryId) await cloudinary.uploader.destroy(photo.cloudinaryId).catch(() => {});
    await prisma.menuPhoto.delete({ where: { id: photo.id } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
