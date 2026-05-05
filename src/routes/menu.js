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
      { folder: `menuswipe/${folder}`,
        transformation: [
          { width: 1080, height: 1920, crop: "fill", gravity: "auto" },
          { quality: "auto:good", fetch_format: "auto" },
        ] },
      (error, result) => { if (error) return reject(error); resolve(result); }
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
}

const VALID_MARKETING = ["NEW", "BESTSELLER", "OFFER", "LIMITED", "SEASONAL", "LOCAL_FOOD", "SOLD_OUT", null];
const VALID_DIETARY = ["SPICY", "VEGAN", "GLUTEN_FREE", "HALAL", "DAIRY_FREE", "PROTEIN_PLUS", null];

function sanitizeTag(tag, validList) {
  if (tag === undefined) return undefined;
  if (tag === null || tag === "" || tag === "NONE") return null;
  if (validList.includes(tag)) return tag;
  return null;
}

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const items = await prisma.menuItem.findMany({
      where: { organizationId: req.org.id },
      include: {
        photos: { orderBy: { sortOrder: "asc" } },
        itemBranches: { select: { branchId: true } },
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    const result = items.map(i => ({
      ...i,
      branchIds: i.itemBranches.map(ib => ib.branchId),
      itemBranches: undefined,
    }));
    res.json(result);
  } catch (err) { next(err); }
});

router.post("/", requireAuth, async (req, res, next) => {
  try {
    const { name, description, price, category, branchIds, isBestseller, tagMarketing, tagDietary, isProperName } = req.body;
    if (!name || price === undefined) return res.status(400).json({ error: "name and price required" });

    let targetBranches = branchIds;
    if (!Array.isArray(targetBranches) || targetBranches.length === 0) {
      const all = await prisma.branch.findMany({
        where: { organizationId: req.org.id },
        select: { id: true },
      });
      targetBranches = all.map(b => b.id);
    }

    const item = await prisma.menuItem.create({
      data: {
        organizationId: req.org.id,
        name, description: description || null,
        price: parseFloat(price),
        category: category || "MAIN",
        isBestseller: !!isBestseller,
        isProperName: !!isProperName,
        tagMarketing: sanitizeTag(tagMarketing, VALID_MARKETING) ?? null,
        tagDietary: sanitizeTag(tagDietary, VALID_DIETARY) ?? null,
        itemBranches: { create: targetBranches.map(bid => ({ branchId: bid })) },
      },
      include: { photos: true, itemBranches: true },
    });

    // Async: aktif diller için açıklama + çeviri tetikle (background, response'u beklemiyor)
    triggerAutoTranslate(item.id, req.org).catch(e => console.error("Auto-translate failed:", e.message));

    res.status(201).json({
      ...item,
      branchIds: item.itemBranches.map(ib => ib.branchId),
      itemBranches: undefined,
    });
  } catch (err) { next(err); }
});

// Background: yeni item için açıklama oluştur + tüm aktif dillere çevir
async function triggerAutoTranslate(itemId, org) {
  try {
    const enabled = org.enabledLanguages || [];
    if (enabled.length === 0) return;

    const item = await prisma.menuItem.findUnique({ where: { id: itemId } });
    if (!item) return;

    // Eğer açıklama yoksa ana dilde oluştur
    let workingItem = item;
    if (!item.description || item.description.trim() === "") {
      try {
        const { generateDescription } = require("../services/ai");
        const cat = await prisma.category.findFirst({
          where: { organizationId: org.id, code: item.category },
        });
        const desc = await generateDescription(item.name, cat?.label || "Main", org.defaultLanguage || "en");
        if (desc) {
          workingItem = await prisma.menuItem.update({
            where: { id: itemId },
            data: { description: desc },
          });
        }
      } catch (e) { console.warn("Description generation failed:", e.message); }
    }

    // Çevirileri yap
    const { translateItem } = require("../services/ai");
    const sourceLanguage = org.defaultLanguage || "en";
    for (const lang of enabled) {
      try {
        const result = await translateItem(
          { name: workingItem.name, description: workingItem.description, isProperName: workingItem.isProperName, category: workingItem.category },
          sourceLanguage,
          lang
        );
        if (result) {
          await prisma.menuItemTranslation.upsert({
            where: { menuItemId_language: { menuItemId: itemId, language: lang } },
            create: {
              menuItemId: itemId,
              language: lang,
              name: result.name,
              description: result.description,
              isManualOverride: false,
            },
            update: { name: result.name, description: result.description, isManualOverride: false },
          });
        }
      } catch (e) { console.warn(`Translate to ${lang} failed:`, e.message); }
    }
  } catch (err) {
    console.error("triggerAutoTranslate error:", err);
  }
}

router.patch("/:id", requireAuth, async (req, res, next) => {
  try {
    const item = await prisma.menuItem.findFirst({
      where: { id: req.params.id, organizationId: req.org.id },
    });
    if (!item) return res.status(404).json({ error: "Item not found" });

    const { name, description, price, category, active, sortOrder, isBestseller, branchIds, tagMarketing, tagDietary } = req.body;
    const data = {};
    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;
    if (price !== undefined) data.price = parseFloat(price);
    if (category !== undefined) data.category = category;
    if (active !== undefined) data.active = active;
    if (sortOrder !== undefined) data.sortOrder = sortOrder;
    if (isBestseller !== undefined) {
      data.isBestseller = !!isBestseller;
      // Eski API uyumluluğu: yıldız işaretlenirse marketing tag de güncellensin
      if (isBestseller && !item.tagMarketing) data.tagMarketing = "BESTSELLER";
      if (!isBestseller && item.tagMarketing === "BESTSELLER") data.tagMarketing = null;
    }
    
    const sm = sanitizeTag(tagMarketing, VALID_MARKETING);
    if (sm !== undefined) {
      data.tagMarketing = sm;
      // Marketing tag senkronize: BESTSELLER seçilince isBestseller=true
      data.isBestseller = sm === "BESTSELLER";
    }
    const sd = sanitizeTag(tagDietary, VALID_DIETARY);
    if (sd !== undefined) data.tagDietary = sd;

    // Allergens
    const VALID_ALLERGENS = ["GLUTEN","CRUSTACEANS","EGGS","FISH","PEANUTS","SOYBEANS","MILK","NUTS","CELERY","MUSTARD","SESAME","SULPHITES","LUPIN","MOLLUSCS"];
    if (Array.isArray(req.body.allergens)) {
      data.allergens = req.body.allergens.filter(a => VALID_ALLERGENS.includes(a));
    }

    if (Array.isArray(branchIds)) {
      await prisma.menuItemBranch.deleteMany({ where: { menuItemId: req.params.id } });
      data.itemBranches = { create: branchIds.map(bid => ({ branchId: bid })) };
    }

    const updated = await prisma.menuItem.update({
      where: { id: req.params.id },
      data,
      include: {
        photos: { orderBy: { sortOrder: "asc" } },
        itemBranches: { select: { branchId: true } },
      },
    });
    res.json({
      ...updated,
      branchIds: updated.itemBranches.map(ib => ib.branchId),
      itemBranches: undefined,
    });
  } catch (err) { next(err); }
});

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

router.delete("/:id/photos/:photoId", requireAuth, async (req, res, next) => {
  try {
    const photo = await prisma.menuPhoto.findFirst({ where: { id: req.params.photoId, menuItemId: req.params.id } });
    if (!photo) return res.status(404).json({ error: "Photo not found" });
    if (photo.cloudinaryId) await cloudinary.uploader.destroy(photo.cloudinaryId).catch(() => {});
    await prisma.menuPhoto.delete({ where: { id: photo.id } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post("/_logo", requireAuth, upload.single("logo"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const result = await uploadToCloudinary(req.file.buffer, `${req.org.id}/logo`);
    const updated = await prisma.organization.update({
      where: { id: req.org.id },
      data: { logoUrl: result.secure_url },
    });
    res.json({ logoUrl: updated.logoUrl });
  } catch (err) { next(err); }
});

router.post("/:id/regenerate-description", requireAuth, async (req, res, next) => {
  try {
    const item = await prisma.menuItem.findFirst({
      where: { id: req.params.id, organizationId: req.org.id },
    });
    if (!item) return res.status(404).json({ error: "Item not found" });

    const { generateDescription } = require("../services/ai");
    const cat = await prisma.category.findFirst({
      where: { organizationId: req.org.id, code: item.category },
    });
    const catLabel = cat?.label || "Main";

    const lang = req.org.defaultLanguage || "en";
    const description = await generateDescription(item.name, catLabel, lang);

    const updated = await prisma.menuItem.update({
      where: { id: item.id },
      data: { description },
      include: {
        photos: { orderBy: { sortOrder: "asc" } },
        itemBranches: { select: { branchId: true } },
      },
    });

    res.json({
      ...updated,
      branchIds: updated.itemBranches.map(ib => ib.branchId),
      itemBranches: undefined,
    });
  } catch (err) { next(err); }
});

module.exports = router;
