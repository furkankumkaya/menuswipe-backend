const router = require("express").Router();
const { PrismaClient } = require("@prisma/client");
const { requireAuth } = require("../middleware/auth");

const prisma = new PrismaClient();

const DEFAULT_CATS = [
  { code: "MAIN", label: "Main", color: "#993C1D", sortOrder: 0, group: "food" },
  { code: "STARTER", label: "Starter", color: "#0F6E56", sortOrder: 1, group: "food" },
  { code: "DRINK", label: "Drink", color: "#185FA5", sortOrder: 2, group: "drinks" },
  { code: "DESSERT", label: "Dessert", color: "#534AB7", sortOrder: 3, group: "dessert" },
];

const DRINK_KW = ['drink','beer','wine','cocktail','coffee','tea','juice','soda','water','smoothie','shake','lemonade','icecek','bira','sarap','kahve','cay','su','mocktail','spirits','beverage'];
const DESSERT_KW = ['dessert','sweet','cake','ice cream','pastry','chocolate','cookie','brownie','tiramisu','cheesecake','tatli','dondurma','baklava','kunefe','sorbet','gelato','macaron','waffle','pancake','crepe','sufle','souffle','profiterol'];

function autoClassifyGroup(code, label) {
  const text = (code + ' ' + label).toLowerCase();
  if (DRINK_KW.some(k => text.includes(k))) return 'drinks';
  if (DESSERT_KW.some(k => text.includes(k))) return 'dessert';
  return 'food';
}

async function ensureDefaults(orgId) {
  const count = await prisma.category.count({ where: { organizationId: orgId } });
  if (count === 0) {
    await prisma.category.createMany({
      data: DEFAULT_CATS.map(c => ({ ...c, organizationId: orgId, visible: true })),
    });
  }
}

router.get("/", requireAuth, async (req, res, next) => {
  try {
    await ensureDefaults(req.org.id);
    const cats = await prisma.category.findMany({
      where: { organizationId: req.org.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    res.json(cats);
  } catch (err) { next(err); }
});

router.post("/", requireAuth, async (req, res, next) => {
  try {
    const { label, color } = req.body;
    if (!label) return res.status(400).json({ error: "Label required" });
    
    const code = "C" + Date.now();
    const last = await prisma.category.findFirst({
      where: { organizationId: req.org.id },
      orderBy: { sortOrder: "desc" },
    });
    
    const cat = await prisma.category.create({
      data: {
        organizationId: req.org.id,
        code,
        label,
        color: color || "#8E1616",
        visible: true,
        sortOrder: last ? last.sortOrder + 1 : 0,
        group: autoClassifyGroup(code, label),
      },
    });
    res.status(201).json(cat);
  } catch (err) { next(err); }
});

router.patch("/:id", requireAuth, async (req, res, next) => {
  try {
    const cat = await prisma.category.findFirst({
      where: { id: req.params.id, organizationId: req.org.id },
    });
    if (!cat) return res.status(404).json({ error: "Category not found" });

    const { label, color, visible, sortOrder, group } = req.body;
    const data = {};
    if (label !== undefined) data.label = label;
    if (color !== undefined) data.color = color;
    if (visible !== undefined) data.visible = visible;
    if (sortOrder !== undefined) data.sortOrder = sortOrder;
    if (group !== undefined && ['food','drinks','dessert'].includes(group)) data.group = group;

    const updated = await prisma.category.update({
      where: { id: req.params.id },
      data,
    });
    res.json(updated);
  } catch (err) { next(err); }
});

// Bulk update category groups (drag-drop reassignment)
router.patch("/bulk-group", requireAuth, async (req, res, next) => {
  try {
    const { updates } = req.body; // [{id, group}]
    if (!Array.isArray(updates)) return res.status(400).json({ error: "updates array required" });
    for (const u of updates) {
      if (!['food','drinks','dessert'].includes(u.group)) continue;
      await prisma.category.updateMany({
        where: { id: u.id, organizationId: req.org.id },
        data: { group: u.group },
      });
    }
    const cats = await prisma.category.findMany({
      where: { organizationId: req.org.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    res.json(cats);
  } catch (err) { next(err); }
});

router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const cat = await prisma.category.findFirst({
      where: { id: req.params.id, organizationId: req.org.id },
    });
    if (!cat) return res.status(404).json({ error: "Category not found" });
    
    const count = await prisma.category.count({ where: { organizationId: req.org.id } });
    if (count <= 1) return res.status(400).json({ error: "Cannot delete the only category" });
    
    // Bu kategorideki itemları MAIN'e taşı
    const fallback = await prisma.category.findFirst({
      where: { organizationId: req.org.id, NOT: { id: cat.id } },
      orderBy: { sortOrder: "asc" },
    });
    if (fallback) {
      await prisma.menuItem.updateMany({
        where: { organizationId: req.org.id, category: cat.code },
        data: { category: fallback.code },
      });
    }
    
    await prisma.category.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
