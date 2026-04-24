// src/routes/branches.js
const router = require("express").Router();
const { PrismaClient } = require("@prisma/client");
const { requireAuth, requirePlan } = require("../middleware/auth");

const prisma = new PrismaClient();

const PLAN_BRANCH_LIMITS = { STARTER: 1, PRO: 1, CHAIN: 5 };

function slugify(str) {
  return str.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

// ─── GET /api/branches ───────────────────────────────
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const branches = await prisma.branch.findMany({
      where: { organizationId: req.org.id },
      orderBy: { createdAt: "asc" },
    });
    res.json(branches);
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/branches ──────────────────────────────
router.post(
  "/",
  requireAuth,
  requirePlan("CHAIN"),
  async (req, res, next) => {
    try {
      const existing = await prisma.branch.count({
        where: { organizationId: req.org.id },
      });
      const limit = PLAN_BRANCH_LIMITS[req.org.plan] || 1;
      if (existing >= limit) {
        return res.status(403).json({
          error: `Your plan allows up to ${limit} branch(es). Upgrade to Chain for more.`,
        });
      }

      const { name, city, address, phone } = req.body;
      if (!name) return res.status(400).json({ error: "name is required" });

      const baseSlug = slugify(name);
      let slug = baseSlug;
      let attempt = 1;
      while (
        await prisma.branch.findUnique({
          where: { organizationId_slug: { organizationId: req.org.id, slug } },
        })
      ) {
        slug = `${baseSlug}-${attempt++}`;
      }

      const branch = await prisma.branch.create({
        data: { organizationId: req.org.id, name, city, address, phone, slug },
      });
      res.status(201).json(branch);
    } catch (err) {
      next(err);
    }
  }
);

// ─── PATCH /api/branches/:id ─────────────────────────
router.patch("/:id", requireAuth, async (req, res, next) => {
  try {
    const branch = await prisma.branch.findFirst({
      where: { id: req.params.id, organizationId: req.org.id },
    });
    if (!branch) return res.status(404).json({ error: "Branch not found" });

    const { name, city, address, phone, active } = req.body;
    const updated = await prisma.branch.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(city !== undefined && { city }),
        ...(address !== undefined && { address }),
        ...(phone !== undefined && { phone }),
        ...(active !== undefined && { active }),
      },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /api/branches/:id ────────────────────────
router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const count = await prisma.branch.count({ where: { organizationId: req.org.id } });
    if (count <= 1) {
      return res.status(400).json({ error: "Cannot delete the last branch" });
    }

    const branch = await prisma.branch.findFirst({
      where: { id: req.params.id, organizationId: req.org.id },
    });
    if (!branch) return res.status(404).json({ error: "Branch not found" });

    await prisma.branch.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/branches/:id/price-override ───────────
// Allow Chain plan to set branch-specific prices
router.post(
  "/:id/price-override",
  requireAuth,
  requirePlan("CHAIN"),
  async (req, res, next) => {
    try {
      const { menuItemId, price } = req.body;
      const override = await prisma.priceOverride.upsert({
        where: { branchId_menuItemId: { branchId: req.params.id, menuItemId } },
        create: { branchId: req.params.id, menuItemId, price: parseFloat(price) },
        update: { price: parseFloat(price) },
      });
      res.json(override);
    } catch (err) {
      next(err);
    }
  }
);

// ─── PATCH /api/branches/settings ───────────────────
// Toggle shareMenu, branchPriceOverride
router.patch("/settings", requireAuth, async (req, res, next) => {
  try {
    const { shareMenu, branchPriceOverride } = req.body;
    const org = await prisma.organization.update({
      where: { id: req.org.id },
      data: {
        ...(shareMenu !== undefined && { shareMenu }),
        ...(branchPriceOverride !== undefined && { branchPriceOverride }),
      },
    });
    res.json({ shareMenu: org.shareMenu, branchPriceOverride: org.branchPriceOverride });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/branches/:id/track-view ──────────────
// Increment view counter — called by customer menu page
router.post("/:id/track-view", async (req, res) => {
  await prisma.branch.update({
    where: { id: req.params.id },
    data: { views: { increment: 1 } },
  }).catch(() => {});
  res.json({ ok: true });
});

// ─── POST /api/branches/:id/track-qr ────────────────
router.post("/:id/track-qr", async (req, res) => {
  await prisma.branch.update({
    where: { id: req.params.id },
    data: { qrScans: { increment: 1 } },
  }).catch(() => {});
  res.json({ ok: true });
});

module.exports = router;
