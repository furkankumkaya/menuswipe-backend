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

// V2 — Orders + views birleşik analytics
router.get("/v2", requireAuth, async (req, res, next) => {
  try {
    const orgId = req.org.id;
    const period = req.query.period || "today"; // today | week | month | custom
    const customStart = req.query.start ? new Date(req.query.start) : null;
    const customEnd = req.query.end ? new Date(req.query.end) : null;
    
    const now = new Date();
    let rangeStart, rangeEnd, prevStart, prevEnd;
    
    if (period === "custom" && customStart && customEnd) {
      rangeStart = customStart;
      rangeEnd = customEnd;
      const span = rangeEnd.getTime() - rangeStart.getTime();
      prevEnd = new Date(rangeStart.getTime());
      prevStart = new Date(rangeStart.getTime() - span);
    } else if (period === "week") {
      rangeStart = new Date(now.getTime() - 7 * 86400000);
      rangeEnd = now;
      prevStart = new Date(now.getTime() - 14 * 86400000);
      prevEnd = rangeStart;
    } else if (period === "month") {
      rangeStart = new Date(now.getTime() - 30 * 86400000);
      rangeEnd = now;
      prevStart = new Date(now.getTime() - 60 * 86400000);
      prevEnd = rangeStart;
    } else {
      // today: bugün 00:00'dan şimdiye
      rangeStart = new Date(now);
      rangeStart.setHours(0, 0, 0, 0);
      rangeEnd = now;
      prevStart = new Date(rangeStart.getTime() - 86400000);
      prevEnd = rangeStart;
    }
    
    // Tamamlanmış siparişleri çek (gelir hesabı için)
    const completedOrders = await prisma.order.findMany({
      where: {
        organizationId: orgId,
        status: "completed",
        createdAt: { gte: rangeStart, lte: rangeEnd },
      },
      select: { id: true, items: true, subtotal: true, currency: true, createdAt: true, tableLabel: true },
      orderBy: { createdAt: "asc" },
    });
    
    // Önceki dönem (delta hesabı için)
    const prevOrders = await prisma.order.count({
      where: {
        organizationId: orgId,
        status: "completed",
        createdAt: { gte: prevStart, lte: prevEnd },
      },
    });
    const prevRevenueRows = await prisma.order.aggregate({
      where: {
        organizationId: orgId,
        status: "completed",
        createdAt: { gte: prevStart, lte: prevEnd },
      },
      _sum: { subtotal: true },
    });
    const prevRevenue = prevRevenueRows._sum.subtotal || 0;
    
    // Toplamlar
    const totalRevenue = completedOrders.reduce((s, o) => s + (o.subtotal || 0), 0);
    const orderCount = completedOrders.length;
    const avgCart = orderCount > 0 ? totalRevenue / orderCount : 0;
    
    // Delta
    const revenueDelta = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : null;
    const orderDelta = prevOrders > 0 ? orderCount - prevOrders : null;
    const prevAvg = prevOrders > 0 ? prevRevenue / prevOrders : 0;
    const avgCartDelta = prevAvg > 0 ? ((avgCart - prevAvg) / prevAvg) * 100 : null;
    
    // Saatlik dağılım (today/week için anlamlı)
    const buckets = [];
    if (period === "today") {
      for (let h = 0; h < 24; h++) buckets.push({ label: String(h).padStart(2, "0"), revenue: 0, orders: 0 });
      for (const o of completedOrders) {
        const h = new Date(o.createdAt).getHours();
        buckets[h].revenue += o.subtotal || 0;
        buckets[h].orders += 1;
      }
    } else {
      // Günlük dağılım
      const dayCount = Math.ceil((rangeEnd - rangeStart) / 86400000);
      const days = Math.min(dayCount, 90);
      for (let i = 0; i < days; i++) {
        const d = new Date(rangeStart.getTime() + i * 86400000);
        buckets.push({ label: d.toISOString().slice(5, 10), date: d.toISOString().slice(0, 10), revenue: 0, orders: 0 });
      }
      for (const o of completedOrders) {
        const d = new Date(o.createdAt).toISOString().slice(0, 10);
        const bucket = buckets.find(b => b.date === d);
        if (bucket) {
          bucket.revenue += o.subtotal || 0;
          bucket.orders += 1;
        }
      }
    }
    
    // Item-level aggregations (items içinden çıkar)
    const itemAgg = new Map(); // itemId -> {name, qty, revenue}
    const catAgg = new Map(); // category -> {revenue, orders}
    const tableAgg = new Map(); // tableLabel -> {revenue, orders}
    
    for (const o of completedOrders) {
      const items = Array.isArray(o.items) ? o.items : [];
      for (const it of items) {
        if (!it.itemId) continue;
        const cur = itemAgg.get(it.itemId) || { id: it.itemId, name: it.originalName || it.name, qty: 0, revenue: 0 };
        cur.qty += it.qty || 1;
        cur.revenue += (it.price || 0) * (it.qty || 1);
        itemAgg.set(it.itemId, cur);
        
        // Kategori dağılımı
        const cat = it.category || "OTHER";
        const catCur = catAgg.get(cat) || { category: cat, revenue: 0, orders: 0 };
        catCur.revenue += (it.price || 0) * (it.qty || 1);
        catAgg.set(cat, catCur);
      }
      
      // Masa
      if (o.tableLabel) {
        const t = tableAgg.get(o.tableLabel) || { label: o.tableLabel, revenue: 0, orders: 0 };
        t.revenue += o.subtotal || 0;
        t.orders += 1;
        tableAgg.set(o.tableLabel, t);
      }
    }
    
    // Top items by qty
    const topItemsByQty = Array.from(itemAgg.values())
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10);
    
    // Top items by revenue
    const topItemsByRevenue = Array.from(itemAgg.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
    
    // Kategori dağılımı (gelir bazında)
    const catTotal = Array.from(catAgg.values()).reduce((s, c) => s + c.revenue, 0);
    const categoryBreakdown = Array.from(catAgg.values())
      .map(c => ({ ...c, percent: catTotal > 0 ? (c.revenue / catTotal) * 100 : 0 }))
      .sort((a, b) => b.revenue - a.revenue);
    
    // Top masalar
    const topTables = Array.from(tableAgg.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
    
    // Menu views (mevcut sistemden)
    const viewCount = await prisma.menuView.count({
      where: {
        organizationId: orgId,
        itemId: null,
        createdAt: { gte: rangeStart, lte: rangeEnd },
      },
    });
    const prevViewCount = await prisma.menuView.count({
      where: {
        organizationId: orgId,
        itemId: null,
        createdAt: { gte: prevStart, lte: prevEnd },
      },
    });
    const viewDelta = prevViewCount > 0 ? ((viewCount - prevViewCount) / prevViewCount) * 100 : null;
    
    // Currency
    const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { currency: true } });
    
    res.json({
      period,
      range: { start: rangeStart.toISOString(), end: rangeEnd.toISOString() },
      currency: org?.currency || "USD",
      kpis: {
        revenue: { value: totalRevenue, delta: revenueDelta },
        orders: { value: orderCount, delta: orderDelta },
        avgCart: { value: avgCart, delta: avgCartDelta },
        views: { value: viewCount, delta: viewDelta },
      },
      timeline: buckets, // saatlik veya günlük
      categoryBreakdown,
      topItemsByQty,
      topItemsByRevenue,
      topTables,
    });
  } catch (err) {
    console.error("[analytics v2] error:", err.message);
    next(err);
  }
});

module.exports = router;
