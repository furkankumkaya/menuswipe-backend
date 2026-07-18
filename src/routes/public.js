const router = require("express").Router();
const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");
const { getSubscriptionInfo } = require("../middleware/subscription");
const { recommendItems } = require("../services/ai");

const prisma = new PrismaClient();

// Rate limiting: IP başına AI çağrısı (basit memory cache)
const aiRequestCache = new Map(); // ip -> { count, resetAt }
const AI_RATE_LIMIT = 20; // saatte 20 istek
const AI_RATE_WINDOW = 60 * 60 * 1000; // 1 saat

function checkAiRateLimit(ip) {
  const now = Date.now();
  const entry = aiRequestCache.get(ip);
  if (!entry || entry.resetAt < now) {
    aiRequestCache.set(ip, { count: 1, resetAt: now + AI_RATE_WINDOW });
    return true;
  }
  if (entry.count >= AI_RATE_LIMIT) return false;
  entry.count++;
  return true;
}

function hashIp(ip) {
  return crypto.createHash("sha256").update(ip + (process.env.JWT_SECRET || "salt")).digest("hex").slice(0, 32);
}

// ÖNEMLİ: Bu specific endpoint menu catch-all'dan ÖNCE olmalı
// Yoksa /:orgSlug/:branchSlug? pattern'i "tables"’ı branchSlug olarak yorumlar
router.get("/:orgSlug/tables", async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { slug: req.params.orgSlug },
    });
    if (!org) return res.status(404).json({ error: "not_found" });
    
    const tables = await prisma.restaurantTable.findMany({
      where: { organizationId: org.id, active: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, label: true },
    });
    res.json(tables);
  } catch (err) {
    console.error("[tables] error:", err.message);
    res.json([]);
  }
});

// QR signature dogrulama
function verifyQrSignature(qrSecret, orgSlug, tableId, signature) {
  if (!qrSecret || !signature) return false;
  const payload = orgSlug + ":" + (tableId || "all");
  const expected = crypto
    .createHmac("sha256", qrSecret)
    .update(payload)
    .digest("hex")
    .slice(0, 16);
  return expected === signature;
}

router.get("/:orgSlug/:branchSlug?", async (req, res, next) => {
  try {
    const { orgSlug, branchSlug } = req.params;
    const qrSignature = req.query.s || null;
    const qrTableId = req.query.t || null;
    const fromQr = !!(qrSignature || req.query.qr === "1");

    const org = await prisma.organization.findUnique({
      where: { slug: orgSlug },
      include: {
        branches: { where: { active: true }, orderBy: { createdAt: "asc" } },
        categories: { where: { visible: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      },
    });
    if (!org) return res.status(404).json({ error: "Restaurant not found" });

    // QR signature kontrolü
    let qrValid = false;
    if (qrSignature && org.qrSecret) {
      qrValid = verifyQrSignature(org.qrSecret, orgSlug, qrTableId, qrSignature);
    }

    // Subscription kontrolü - süresi dolmuş restoran menüsü erişilemez
    const subInfo = getSubscriptionInfo(org);
    if (!subInfo.isActive) {
      return res.status(402).json({
        error: "menu_unavailable",
        message: "This menu is currently unavailable.",
        organization: {
          name: org.name,
          logoUrl: org.logoUrl,
        },
      });
    }

    const activeBranches = org.branches;
    if (activeBranches.length === 0) return res.status(404).json({ error: "No active branches" });

    let selectedBranch = null;
    if (branchSlug) {
      selectedBranch = activeBranches.find(b => b.slug === branchSlug);
      if (!selectedBranch) return res.status(404).json({ error: "Branch not found" });
    } else {
      selectedBranch = activeBranches[0];
    }

    let items = [];
    try {
      items = await prisma.menuItem.findMany({
        where: {
          organizationId: org.id,
          active: true,
          // Branch'a atanmış VEYA hiç branch'ı olmayan (eski/import) item'lar
          OR: [
            { itemBranches: { some: { branchId: selectedBranch.id } } },
            { itemBranches: { none: {} } },
          ],
        },
        include: {
          photos: { orderBy: { sortOrder: "asc" } },
          translations: true,
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      });
    } catch (e) {
      console.warn("Full query failed, falling back:", e.message);
      items = await prisma.menuItem.findMany({
        where: {
          organizationId: org.id,
          active: true,
        },
        include: {
          photos: { orderBy: { sortOrder: "asc" } },
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      });
    }

    // Dil seçimi
    const requestedLang = req.query.lang;
    const defaultLang = org.defaultLanguage || "en";
    const enabledLangs = org.enabledLanguages || [];
    const allLangs = [defaultLang, ...enabledLangs];
    const selectedLang = (requestedLang && allLangs.includes(requestedLang)) ? requestedLang : defaultLang;

    // Item'ları seçili dile göre map et
    const localizedItems = items.map(it => {
      const trs = it.translations || [];
      const tr = trs.find(t => t.language === selectedLang);
      const useTranslation = selectedLang !== defaultLang && tr;
      return {
        id: it.id,
        name: useTranslation ? tr.name : it.name,
        originalName: it.name,
        description: useTranslation ? (tr.description || it.description) : it.description,
        price: it.price,
        category: it.category,
        isBestseller: it.isBestseller,
        tagMarketing: it.tagMarketing,
        tagDietary: it.tagDietary,
        allergens: it.allergens || [],
        crossSellItemId: it.crossSellItemId || null,
        sortOrder: it.sortOrder,
        photos: it.photos,
      };
    });

    // Kategorileri de localize et
    let catsWithTranslations = [];
    try {
      catsWithTranslations = await prisma.category.findMany({
        where: { organizationId: org.id, visible: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: { translations: true },
      });
    } catch(e) {
      catsWithTranslations = await prisma.category.findMany({
        where: { organizationId: org.id, visible: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      });
    }
    const localizedCats = catsWithTranslations.map(c => {
      const trs = c.translations || [];
      const tr = trs.find(t => t.language === selectedLang);
      const useTranslation = selectedLang !== defaultLang && tr;
      return {
        code: c.code,
        label: useTranslation ? tr.label : c.label,
        originalLabel: c.label,
        color: c.color,
        sortOrder: c.sortOrder,
      };
    });

    const cats = {};
    for (const it of localizedItems) cats[it.category] = (cats[it.category] || 0) + 1;

    const ip = req.headers["x-forwarded-for"]?.split(",")[0] || req.ip || "unknown";
    prisma.menuView.create({
      data: {
        organizationId: org.id,
        branchId: selectedBranch.id,
        fromQr,
        userAgent: (req.headers["user-agent"] || "").slice(0, 200),
        ipHash: hashIp(ip),
      },
    }).catch(() => {});

    res.json({
      organization: {
        id: org.id, name: org.name, slug: org.slug,
        logoUrl: org.logoUrl, accentColor: org.accentColor,
        currency: org.currency || "USD",
        phone: org.phone, website: org.website,
        instagram: org.instagram, facebook: org.facebook,
        country: org.country, city: org.city,
        address: org.address, postalCode: org.postalCode,
        googleMapsUrl: org.googleMapsUrl, googlePlaceId: org.googlePlaceId,
        latitude: org.latitude, longitude: org.longitude,
        workingHours: org.workingHours,
        orderListEnabled: org.orderListEnabled !== false,
        googleInsightsAvailable: !!(org.googleInsights && Array.isArray(org.googleInsights.popularDishes) && org.googleInsights.popularDishes.length > 0),
      },
      qrValid,
      qrTableId: qrValid ? qrTableId : null,
      branch: {
        id: selectedBranch.id, name: selectedBranch.name, slug: selectedBranch.slug,
        phone: selectedBranch.phone,
        country: selectedBranch.country, city: selectedBranch.city,
        address: selectedBranch.address, postalCode: selectedBranch.postalCode,
        googleMapsUrl: selectedBranch.googleMapsUrl, googlePlaceId: selectedBranch.googlePlaceId,
        latitude: selectedBranch.latitude, longitude: selectedBranch.longitude,
        workingHours: selectedBranch.workingHours,
      },
      branches: activeBranches.map(b => ({
        id: b.id, name: b.name, slug: b.slug, city: b.city,
      })),
      categories: localizedCats,
      items: localizedItems,
      categoryCounts: cats,
      currentLanguage: selectedLang,
      defaultLanguage: defaultLang,
      availableLanguages: allLangs,
    });
  } catch (err) { next(err); }
});

router.post("/:orgSlug/track-item", async (req, res, next) => {
  try {
    const { itemId, branchSlug } = req.body;
    const org = await prisma.organization.findUnique({ where: { slug: req.params.orgSlug } });
    if (!org) return res.json({ ok: false });
    let branchId = null;
    if (branchSlug) {
      const b = await prisma.branch.findFirst({ where: { organizationId: org.id, slug: branchSlug } });
      if (b) branchId = b.id;
    }
    await prisma.menuView.create({
      data: {
        organizationId: org.id,
        branchId,
        itemId: itemId || null,
        userAgent: (req.headers["user-agent"] || "").slice(0, 200),
      },
    }).catch(() => {});
    res.json({ ok: true });
  } catch (err) { res.json({ ok: false }); }
});

// AI Menu Concierge — ürün önerisi
router.post("/:orgSlug/ai-recommend", async (req, res, next) => {
  try {
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || "unknown";
    
    if (!checkAiRateLimit(ip)) {
      return res.status(429).json({ error: "rate_limit", message: "Too many requests. Try again later." });
    }
    
    const org = await prisma.organization.findUnique({
      where: { slug: req.params.orgSlug },
    });
    if (!org) return res.status(404).json({ error: "not_found" });
    
    // Subscription kontrolü (trial dahil hepsine açık)
    const sub = getSubscriptionInfo(org);
    if (sub.status === "expired_grace" && Date.now() > new Date(sub.menuLockedUntil || 0).getTime()) {
      return res.status(402).json({ error: "menu_unavailable" });
    }
    
    const answers = req.body.answers || {};
    const language = (req.body.language || org.defaultLanguage || "en").slice(0, 5);
    const useGoogleReviews = req.body.useGoogleReviews !== false; // default true
    
    // Menü item'larını çek (translations dahil)
    let items = [];
    try {
      items = await prisma.menuItem.findMany({
        where: { organizationId: org.id, active: true },
        include: { translations: true, photos: { orderBy: { sortOrder: "asc" }, take: 1 } },
      });
    } catch (e) {
      items = await prisma.menuItem.findMany({
        where: { organizationId: org.id, active: true },
        include: { photos: { orderBy: { sortOrder: "asc" }, take: 1 } },
      });
    }
    
    if (items.length === 0) {
      return res.status(400).json({ error: "no_menu", message: "Menu is empty" });
    }
    
    const defaultLang = org.defaultLanguage || "en";
    
    // Item'ları seçili dile localize et
    const localizedItems = items.map(it => {
      const trs = it.translations || [];
      const tr = trs.find(t => t.language === language);
      const useTranslation = language !== defaultLang && tr;
      return {
        id: it.id,
        name: useTranslation ? tr.name : it.name,
        description: useTranslation ? (tr.description || it.description) : it.description,
        category: it.category,
        price: it.price,
        tagDietary: it.tagDietary,
        allergens: it.allergens || [],
        photoUrl: it.photos?.[0]?.url || null,
      };
    });
    
    // Google insights - eğer toggle açıksa ve veri varsa eşleştir
    const { matchInsightsToMenu } = require("../services/gemini");
    let itemInsights = {};
    if (useGoogleReviews && org.googleInsights && Array.isArray(org.googleInsights.popularDishes)) {
      itemInsights = matchInsightsToMenu(org.googleInsights, localizedItems);
    }
    
    // AI'ya gönder - Google verisini ekstra context olarak ekle
    const googleContext = useGoogleReviews && Object.keys(itemInsights).length > 0 
      ? buildGoogleContext(itemInsights, localizedItems) 
      : null;
    
    const result = await recommendItems(localizedItems, answers, language, googleContext);
    
    // Sonucu zenginleştir - item detaylarını ekle + Google quotes
    const enrichedItems = result.items.map(rec => {
      const item = localizedItems.find(i => i.id === rec.id);
      if (!item) return null;
      const insight = itemInsights[item.id];
      return {
        id: item.id,
        name: item.name,
        description: item.description,
        price: item.price,
        category: item.category,
        photoUrl: item.photoUrl,
        allergens: item.allergens,
        reason: rec.reason,
        googleQuote: insight ? { mentions: insight.mentions, quote: insight.quote } : null,
      };
    }).filter(Boolean);
    
    res.json({
      intro: result.intro,
      items: enrichedItems,
    });
  } catch (err) {
    console.error("AI recommend error:", err.message);
    res.status(500).json({ error: "ai_error", message: err.message });
  }
});

// Google context'i AI prompt'una eklemek için string oluştur
function buildGoogleContext(itemInsights, menuItems) {
  const lines = [];
  for (const item of menuItems) {
    const insight = itemInsights[item.id];
    if (insight) {
      lines.push(`- "${item.name}" (mentioned ${insight.mentions} times: "${insight.quote}")`);
    }
  }
  if (lines.length === 0) return null;
  return `\n\nThe following dishes are highly praised in Google Reviews for this restaurant:\n${lines.join("\n")}\n\nWhen multiple menu items match the customer's preferences equally, prefer these popular ones. In your reason field, you may mention "praised by customers" or similar phrasing when recommending these.`;
}

// QR oturumu doğrulama endpoint'i
router.post("/:orgSlug/verify-qr", async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { slug: req.params.orgSlug },
    });
    if (!org) return res.status(404).json({ error: "not_found" });
    const { s, t } = req.body;
    const valid = verifyQrSignature(org.qrSecret, req.params.orgSlug, t || null, s);
    res.json({ valid });
  } catch (err) {
    res.json({ valid: false });
  }
});

// Müşteri: sipariş oluştur
router.post("/:orgSlug/order", async (req, res, next) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { slug: req.params.orgSlug },
    });
    if (!org) {
      console.log("[order] org not found:", req.params.orgSlug);
      return res.status(404).json({ error: "not_found" });
    }

    // Subscription kontrolü
    const sub = getSubscriptionInfo(org);
    if (sub.status === "expired_grace" && Date.now() > new Date(sub.menuLockedUntil || 0).getTime()) {
      return res.status(402).json({ error: "menu_unavailable" });
    }

    // QR oturum kontrolü
    const qrToken = req.body.qrToken;
    if (org.qrSecret && !qrToken) {
      return res.status(403).json({ error: "qr_required", message: "QR code scan required to place orders" });
    }
    if (org.qrSecret && qrToken) {
      const valid = verifyQrSignature(org.qrSecret, req.params.orgSlug, req.body.qrTableId || null, qrToken);
      if (!valid) {
        return res.status(403).json({ error: "qr_invalid", message: "Invalid or expired QR session" });
      }
    }

    const { tableId, tableLabel, items, note, customerName, customerLanguage } = req.body;
    
    console.log("[order] received:", { orgId: org.id, tableId, tableLabel, itemCount: items?.length });
    
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "empty_order" });
    }
    
    // Items'ı doğrula - sadece menüde olan item'lar kabul edilir
    const itemIds = items.map(i => i.itemId).filter(Boolean);
    const menuItems = await prisma.menuItem.findMany({
      where: { organizationId: org.id, id: { in: itemIds }, active: true },
    });
    const menuItemMap = new Map(menuItems.map(mi => [mi.id, mi]));
    
    console.log("[order] valid items found:", menuItems.length, "of", items.length);
    
    // Items'ı temizle ve subtotal hesapla
    let subtotal = 0;
    const cleanedItems = items
      .filter(i => i.itemId && menuItemMap.has(i.itemId))
      .map(i => {
        const mi = menuItemMap.get(i.itemId);
        const qty = Math.max(1, Math.min(99, parseInt(i.qty) || 1));
        const lineTotal = mi.price * qty;
        subtotal += lineTotal;
        return {
          itemId: mi.id,
          name: i.name || mi.name,
          originalName: mi.name,
          price: mi.price,
          qty,
          allergens: mi.allergens || [],
          photoUrl: i.photoUrl || null,
          category: mi.category,
          note: (i.note || "").toString().trim().slice(0, 200) || null,
        };
      });
    
    if (cleanedItems.length === 0) {
      return res.status(400).json({ error: "invalid_items", message: "No valid items in order" });
    }
    
    // Masa kontrolü (opsiyonel)
    let resolvedTableLabel = (tableLabel || "").toString().trim().slice(0, 50) || null;
    let resolvedTableId = null;
    if (tableId) {
      const table = await prisma.restaurantTable.findFirst({
        where: { id: tableId, organizationId: org.id },
      });
      if (table) {
        resolvedTableId = table.id;
        resolvedTableLabel = table.label;
      }
    }
    
    // Bu restoranın günlük order numarası
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const todayCount = await prisma.order.count({
      where: {
        organizationId: org.id,
        createdAt: { gte: startOfDay },
      },
    });
    
    const order = await prisma.order.create({
      data: {
        organizationId: org.id,
        orderNumber: todayCount + 1,
        tableId: resolvedTableId,
        tableLabel: resolvedTableLabel,
        items: cleanedItems,
        subtotal,
        currency: org.currency || "USD",
        note: (note || "").toString().slice(0, 500) || null,
        customerName: (customerName || "").toString().trim().slice(0, 80) || null,
        customerLanguage: (customerLanguage || org.defaultLanguage || "en").slice(0, 5),
        status: "pending",
      },
    });
    
    console.log("[order] created #" + order.orderNumber, "id:", order.id);
    
    res.json({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      tableLabel: order.tableLabel,
      subtotal: order.subtotal,
      currency: order.currency,
    });
  } catch (err) {
    console.error("[order] ERROR:", err.message, err.stack);
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

// Müşteri: aktif masaları listele
module.exports = router;
