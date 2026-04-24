// src/routes/public.js
// No auth — these endpoints are hit by the customer menu page
const router = require("express").Router();
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

// ─── GET /api/public/:orgSlug ────────────────────────
// Full menu for the organization (main branch or shared)
router.get("/:orgSlug", async (req, res, next) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { slug: req.params.orgSlug },
      select: {
        id: true, name: true, slug: true,
        logoUrl: true, accentColor: true,
        plan: true, planStatus: true,
      },
    });

    if (!org) return res.status(404).json({ error: "Restaurant not found" });
    if (org.planStatus === "CANCELLED") {
      return res.status(403).json({ error: "This menu is no longer active" });
    }

    const items = await prisma.menuItem.findMany({
      where: { organizationId: org.id, branchId: null, active: true },
      include: { photos: { orderBy: { sortOrder: "asc" } } },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
    });

    res.json({ organization: org, items });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/public/:orgSlug/:branchSlug ───────────
// Branch-specific menu (respects price overrides)
router.get("/:orgSlug/:branchSlug", async (req, res, next) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { slug: req.params.orgSlug },
    });
    if (!org) return res.status(404).json({ error: "Restaurant not found" });
    if (org.planStatus === "CANCELLED") {
      return res.status(403).json({ error: "This menu is no longer active" });
    }

    const branch = await prisma.branch.findFirst({
      where: { organizationId: org.id, slug: req.params.branchSlug, active: true },
    });
    if (!branch) return res.status(404).json({ error: "Branch not found or inactive" });

    // Track QR scan if ?ref=qr
    if (req.query.ref === "qr") {
      prisma.branch.update({
        where: { id: branch.id },
        data: { qrScans: { increment: 1 } },
      }).catch(() => {});
    }

    // Track view
    prisma.branch.update({
      where: { id: branch.id },
      data: { views: { increment: 1 } },
    }).catch(() => {});

    // Get menu items — shared or branch-specific
    let items;
    if (org.shareMenu) {
      // Shared menu: org-level items + branch price overrides applied
      const raw = await prisma.menuItem.findMany({
        where: { organizationId: org.id, branchId: null, active: true },
        include: {
          photos: { orderBy: { sortOrder: "asc" } },
          priceOverrides: { where: { branchId: branch.id } },
        },
        orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
      });

      items = raw.map((item) => {
        const override = item.priceOverrides[0];
        return {
          ...item,
          price: override ? override.price : item.price,
          priceOverrides: undefined,
        };
      });
    } else {
      // Branch-specific menu
      items = await prisma.menuItem.findMany({
        where: { branchId: branch.id, active: true },
        include: { photos: { orderBy: { sortOrder: "asc" } } },
        orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
      });
    }

    res.json({
      organization: {
        id: org.id, name: org.name, slug: org.slug,
        logoUrl: org.logoUrl, accentColor: org.accentColor,
      },
      branch: {
        id: branch.id, name: branch.name, city: branch.city,
      },
      items,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
