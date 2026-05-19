const router = require("express").Router();
const { PrismaClient } = require("@prisma/client");
const { requireAuth } = require("../middleware/auth");

const prisma = new PrismaClient();

// Admin: tüm siparişleri listele
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const status = req.query.status; // pending, accepted, preparing, ready, completed, cancelled
    const since = req.query.since ? new Date(req.query.since) : null;
    
    const where = { organizationId: req.org.id };
    if (status) where.status = status;
    if (since) where.createdAt = { gte: since };
    
    const orders = await prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { table: true },
    });
    res.json(orders);
  } catch (err) { next(err); }
});

// Admin: yeni sipariş var mı (polling endpoint)
router.get("/poll", requireAuth, async (req, res, next) => {
  try {
    const lastSeen = req.query.since ? new Date(req.query.since) : new Date(Date.now() - 60_000);
    
    const newOrders = await prisma.order.findMany({
      where: {
        organizationId: req.org.id,
        createdAt: { gt: lastSeen },
        status: "pending",
      },
      orderBy: { createdAt: "asc" },
      include: { table: true },
    });
    
    // Toplam pending sayısı
    const pendingCount = await prisma.order.count({
      where: { organizationId: req.org.id, status: "pending" },
    });
    
    // Aktif sipariş sayısı (kabul edildi ama tamamlanmadı)
    const activeCount = await prisma.order.count({
      where: {
        organizationId: req.org.id,
        status: { in: ["accepted", "preparing", "ready"] },
      },
    });
    
    res.json({
      newOrders,
      pendingCount,
      activeCount,
      now: new Date().toISOString(),
    });
  } catch (err) { next(err); }
});

// Admin: status güncelle
router.patch("/:id", requireAuth, async (req, res, next) => {
  try {
    const VALID = ["pending", "accepted", "preparing", "ready", "completed", "cancelled"];
    const status = req.body.status;
    if (!VALID.includes(status)) return res.status(400).json({ error: "Invalid status" });
    
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, organizationId: req.org.id },
    });
    if (!order) return res.status(404).json({ error: "Not found" });
    
    const data = { status };
    if (status === "accepted" && !order.acceptedAt) data.acceptedAt = new Date();
    if (status === "completed" && !order.completedAt) data.completedAt = new Date();
    
    const updated = await prisma.order.update({
      where: { id: req.params.id },
      data,
      include: { table: true },
    });
    res.json(updated);
  } catch (err) { next(err); }
});

// Müşteri: order durumunu sorgula (public)
router.get("/public/:orderId", async (req, res, next) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.orderId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        tableLabel: true,
        items: true,
        subtotal: true,
        currency: true,
        createdAt: true,
        acceptedAt: true,
        completedAt: true,
      },
    });
    if (!order) return res.status(404).json({ error: "Not found" });
    res.json(order);
  } catch (err) { next(err); }
});

module.exports = router;
