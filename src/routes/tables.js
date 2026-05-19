const router = require("express").Router();
const { PrismaClient } = require("@prisma/client");
const { requireAuth } = require("../middleware/auth");

const prisma = new PrismaClient();

// Listele
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const tables = await prisma.restaurantTable.findMany({
      where: { organizationId: req.org.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    res.json(tables);
  } catch (err) { next(err); }
});

// Tek tek ekle
router.post("/", requireAuth, async (req, res, next) => {
  try {
    const label = (req.body.label || "").trim();
    if (!label) return res.status(400).json({ error: "Label required" });
    
    const count = await prisma.restaurantTable.count({ where: { organizationId: req.org.id } });
    const table = await prisma.restaurantTable.create({
      data: {
        organizationId: req.org.id,
        label,
        sortOrder: count,
      },
    });
    res.json(table);
  } catch (err) { next(err); }
});

// Toplu oluştur: "Generate 1-20" gibi
router.post("/bulk", requireAuth, async (req, res, next) => {
  try {
    const count = Math.min(50, Math.max(1, parseInt(req.body.count) || 0));
    const prefix = (req.body.prefix || "").trim();
    if (count < 1) return res.status(400).json({ error: "Invalid count" });
    
    const existing = await prisma.restaurantTable.count({ where: { organizationId: req.org.id } });
    
    const data = [];
    for (let i = 1; i <= count; i++) {
      data.push({
        organizationId: req.org.id,
        label: prefix ? `${prefix} ${i}` : String(i),
        sortOrder: existing + i - 1,
      });
    }
    
    await prisma.restaurantTable.createMany({ data });
    
    const tables = await prisma.restaurantTable.findMany({
      where: { organizationId: req.org.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    res.json(tables);
  } catch (err) { next(err); }
});

// Güncelle
router.patch("/:id", requireAuth, async (req, res, next) => {
  try {
    const table = await prisma.restaurantTable.findFirst({
      where: { id: req.params.id, organizationId: req.org.id },
    });
    if (!table) return res.status(404).json({ error: "Not found" });
    
    const data = {};
    if (req.body.label !== undefined) data.label = String(req.body.label).trim();
    if (req.body.sortOrder !== undefined) data.sortOrder = parseInt(req.body.sortOrder) || 0;
    if (req.body.active !== undefined) data.active = !!req.body.active;
    
    const updated = await prisma.restaurantTable.update({
      where: { id: req.params.id },
      data,
    });
    res.json(updated);
  } catch (err) { next(err); }
});

// Sil
router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    await prisma.restaurantTable.deleteMany({
      where: { id: req.params.id, organizationId: req.org.id },
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
