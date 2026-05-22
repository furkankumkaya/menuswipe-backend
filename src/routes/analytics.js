const router = require("express").Router();
const { PrismaClient } = require("@prisma/client");
const { requireAuth } = require("../middleware/auth");

const prisma = new PrismaClient();

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const orgId = req.org.id;
    const now = new Date();
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Toplam görüntüleme
    const [todayViews, weekViews, monthViews, qrScans] = await Promise.all([
      prisma.menuView.count({ where: { organizationId: orgId, createdAt: { gte: dayAgo }, itemId: null } }),
      prisma.menuView.count({ where: { organizationId: orgId, createdAt: { gte: weekAgo }, itemId: null } }),
      prisma.menuView.count({ where: { organizationId: orgId, createdAt: { gte: monthAgo }, itemId: null } }),
      prisma.menuView.count({ where: { organizationId: orgId, createdAt: { gte: monthAgo }, fromQr: true } }),
    ]);

    // Şube bazında görüntüleme (son 30 gün)
    const branches = await prisma.branch.findMany({
      where: { organizationId: orgId },
      include: {
        _count: {
          select: {
            views: { where: { createdAt: { gte: monthAgo }, itemId: null } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });
    const branchStats = branches.map(b => ({
      id: b.id, name: b.name, slug: b.slug, city: b.city, active: b.active,
      views: b._count.views,
    }));

    // En çok bakılan itemlar (item track view'larından)
    const itemViewsRaw = await prisma.menuView.groupBy({
      by: ["itemId"],
      where: { organizationId: orgId, createdAt: { gte: monthAgo }, itemId: { not: null } },
      _count: { itemId: true },
      orderBy: { _count: { itemId: "desc" } },
      take: 10,
    });
    const itemIds = itemViewsRaw.map(r => r.itemId).filter(Boolean);
    const items = itemIds.length > 0
      ? await prisma.menuItem.findMany({ where: { id: { in: itemIds } } })
      : [];
    const topItems = itemViewsRaw.map(r => {
      const item = items.find(i => i.id === r.itemId);
      return item ? { id: item.id, name: item.name, category: item.category, views: r._count.itemId } : null;
    }).filter(Boolean);

    // Kategori dağılımı
    const allItems = await prisma.menuItem.findMany({
      where: { organizationId: orgId, active: true },
      select: { category: true },
    });
    const catDist = {};
    for (const it of allItems) catDist[it.category] = (catDist[it.category] || 0) + 1;

    res.json({
      summary: { todayViews, weekViews, monthViews, qrScans },
      branchStats,
      topItems,
      categoryDistribution: catDist,
    });
  } catch (err) { next(err); }
});

module.exports = router;
