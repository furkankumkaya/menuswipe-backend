const router = require("express").Router();
const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");
const { getSubscriptionInfo } = require("../middleware/subscription");

const prisma = new PrismaClient();

function hashIp(ip) {
  return crypto.createHash("sha256").update(ip + (process.env.JWT_SECRET || "salt")).digest("hex").slice(0, 32);
}

router.get("/:orgSlug/:branchSlug?", async (req, res, next) => {
  try {
    const { orgSlug, branchSlug } = req.params;
    const fromQr = req.query.qr === "1";

    const org = await prisma.organization.findUnique({
      where: { slug: orgSlug },
      include: {
        branches: { where: { active: true }, orderBy: { createdAt: "asc" } },
        categories: { where: { visible: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      },
    });
    if (!org) return res.status(404).json({ error: "Restaurant not found" });

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

    const items = await prisma.menuItem.findMany({
      where: {
        organizationId: org.id,
        active: true,
        itemBranches: { some: { branchId: selectedBranch.id } },
      },
      include: {
        photos: { orderBy: { sortOrder: "asc" } },
        translations: true,
      },
      orderBy: [{ isBestseller: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    });

    // Dil seçimi
    const requestedLang = req.query.lang;
    const defaultLang = org.defaultLanguage || "en";
    const enabledLangs = org.enabledLanguages || [];
    const allLangs = [defaultLang, ...enabledLangs];
    const selectedLang = (requestedLang && allLangs.includes(requestedLang)) ? requestedLang : defaultLang;

    // Item'ları seçili dile göre map et
    const localizedItems = items.map(it => {
      const tr = it.translations.find(t => t.language === selectedLang);
      const useTranslation = selectedLang !== defaultLang && tr;
      return {
        id: it.id,
        name: useTranslation ? tr.name : it.name,
        originalName: it.name,  // Garson modu için ana dildeki isim
        description: useTranslation ? (tr.description || it.description) : it.description,
        price: it.price,
        category: it.category,
        isBestseller: it.isBestseller,
        tagMarketing: it.tagMarketing,
        tagDietary: it.tagDietary,
        sortOrder: it.sortOrder,
        photos: it.photos,
      };
    });

    // Kategorileri de localize et
    const catsWithTranslations = await prisma.category.findMany({
      where: { organizationId: org.id, visible: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: { translations: true },
    });
    const localizedCats = catsWithTranslations.map(c => {
      const tr = c.translations.find(t => t.language === selectedLang);
      const useTranslation = selectedLang !== defaultLang && tr;
      return {
        code: c.code,
        label: useTranslation ? tr.label : c.label,
        color: c.color,
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
      },
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

module.exports = router;
