const router = require("express").Router();
const { PrismaClient } = require("@prisma/client");
const { requireAuth } = require("../middleware/auth");
const { getSubscriptionInfo, getMaxLanguages } = require("../middleware/subscription");
const { translateItem, translateCategory } = require("../services/ai");

const prisma = new PrismaClient();

// In-memory translation jobs
const translationJobs = new Map();

/**
 * GET /api/translations
 * Mevcut dil ayarları + her dil için kapsama oranı
 */
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const enabled = req.org.enabledLanguages || [];
    const totalItems = await prisma.menuItem.count({ where: { organizationId: req.org.id } });

    const coverage = [];
    for (const lang of enabled) {
      const translatedCount = await prisma.menuItemTranslation.count({
        where: {
          language: lang,
          menuItem: { organizationId: req.org.id },
        },
      });
      coverage.push({
        language: lang,
        translatedCount,
        totalItems,
        percentage: totalItems > 0 ? Math.round((translatedCount / totalItems) * 100) : 0,
      });
    }

    const sub = getSubscriptionInfo(req.org);
    const maxLangs = getMaxLanguages(sub.plan);

    res.json({
      defaultLanguage: req.org.defaultLanguage || "en",
      enabledLanguages: enabled,
      coverage,
      maxLanguages: maxLangs === Infinity ? -1 : maxLangs,
      totalItems,
    });
  } catch (err) { next(err); }
});

/**
 * POST /api/translations/languages
 * Dil ekle/çıkar
 * Body: { add: ["tr"], remove: ["fr"] }
 */
router.post("/languages", requireAuth, async (req, res, next) => {
  try {
    const sub = getSubscriptionInfo(req.org);
    const maxLangs = getMaxLanguages(sub.plan);

    let enabled = [...(req.org.enabledLanguages || [])];
    const { add, remove } = req.body;

    if (Array.isArray(remove)) {
      enabled = enabled.filter(l => !remove.includes(l));
      // Çevirileri silmek opsiyonel - şimdilik sadece dil deactive olur
    }

    if (Array.isArray(add)) {
      for (const lang of add) {
        if (lang === req.org.defaultLanguage) continue; // ana dil zaten ekli
        if (!enabled.includes(lang)) enabled.push(lang);
      }
    }

    // Limit kontrolü
    if (maxLangs !== Infinity && enabled.length > maxLangs) {
      return res.status(402).json({
        error: "Plan limit reached",
        message: `Your plan allows ${maxLangs} additional language${maxLangs===1?'':'s'}. Upgrade to Pro for unlimited.`,
        currentPlan: sub.plan,
      });
    }

    const updated = await prisma.organization.update({
      where: { id: req.org.id },
      data: { enabledLanguages: enabled },
    });

    res.json({ enabledLanguages: updated.enabledLanguages });
  } catch (err) { next(err); }
});

/**
 * POST /api/translations/translate-all
 * Tüm itemları belirtilen dillere (veya tüm aktif dillere) çevirir, async
 */
router.post("/translate-all", requireAuth, async (req, res, next) => {
  try {
    const targetLanguages = Array.isArray(req.body.languages) && req.body.languages.length > 0
      ? req.body.languages
      : (req.org.enabledLanguages || []);

    if (targetLanguages.length === 0) {
      return res.status(400).json({ error: "No target languages" });
    }

    const sourceLanguage = req.org.defaultLanguage || "en";
    const orgId = req.org.id;
    const jobId = "trans_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);

    translationJobs.set(jobId, {
      id: jobId,
      orgId,
      status: "processing",
      total: 0,
      done: 0,
      failed: 0,
      currentLanguage: null,
      startedAt: new Date(),
    });

    // Async işlem
    (async () => {
      try {
        const items = await prisma.menuItem.findMany({
          where: { organizationId: orgId },
          include: { translations: true },
        });
        const categories = await prisma.category.findMany({
          where: { organizationId: orgId },
          include: { translations: true },
        });

        const job = translationJobs.get(jobId);
        if (job) job.total = (items.length + categories.length) * targetLanguages.length;

        for (const lang of targetLanguages) {
          const j = translationJobs.get(jobId);
          if (j) j.currentLanguage = lang;

          // Items
          for (const item of items) {
            const existing = item.translations.find(t => t.language === lang);
            if (existing && existing.isManualOverride) {
              const j2 = translationJobs.get(jobId);
              if (j2) j2.done++;
              continue;
            }

            const result = await translateItem(
              { name: item.name, description: item.description, isProperName: item.isProperName, category: item.category },
              sourceLanguage,
              lang
            );

            if (result) {
              await prisma.menuItemTranslation.upsert({
                where: { menuItemId_language: { menuItemId: item.id, language: lang } },
                create: {
                  menuItemId: item.id,
                  language: lang,
                  name: result.name,
                  description: result.description,
                  isManualOverride: false,
                },
                update: {
                  name: result.name,
                  description: result.description,
                  isManualOverride: false,
                },
              });
              const j2 = translationJobs.get(jobId);
              if (j2) j2.done++;
            } else {
              const j2 = translationJobs.get(jobId);
              if (j2) { j2.done++; j2.failed++; }
            }
          }

          // Categories
          for (const cat of categories) {
            const existing = cat.translations.find(t => t.language === lang);
            if (existing && existing.isManualOverride) {
              const j2 = translationJobs.get(jobId);
              if (j2) j2.done++;
              continue;
            }

            const result = await translateCategory(cat.label, sourceLanguage, lang);
            if (result) {
              await prisma.categoryTranslation.upsert({
                where: { categoryId_language: { categoryId: cat.id, language: lang } },
                create: {
                  categoryId: cat.id,
                  language: lang,
                  label: result,
                  isManualOverride: false,
                },
                update: { label: result, isManualOverride: false },
              });
              const j2 = translationJobs.get(jobId);
              if (j2) j2.done++;
            } else {
              const j2 = translationJobs.get(jobId);
              if (j2) { j2.done++; j2.failed++; }
            }
          }
        }

        const finalJob = translationJobs.get(jobId);
        if (finalJob) {
          finalJob.status = "done";
          finalJob.completedAt = new Date();
        }
      } catch (err) {
        console.error("Translation job failed:", err);
        const j = translationJobs.get(jobId);
        if (j) { j.status = "failed"; j.error = err.message; }
      }
    })();

    res.status(202).json({ jobId });
  } catch (err) { next(err); }
});

/**
 * GET /api/translations/job/:id
 */
router.get("/job/:id", requireAuth, (req, res) => {
  const job = translationJobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found" });
  if (job.orgId !== req.org.id) return res.status(403).json({ error: "Forbidden" });
  res.json({
    id: job.id,
    status: job.status,
    total: job.total,
    done: job.done,
    failed: job.failed,
    currentLanguage: job.currentLanguage,
    error: job.error,
  });
});

/**
 * GET /api/translations/item/:id
 * Bir item'ın tüm çevirilerini getir
 */
router.get("/item/:id", requireAuth, async (req, res, next) => {
  try {
    const item = await prisma.menuItem.findFirst({
      where: { id: req.params.id, organizationId: req.org.id },
      include: { translations: true },
    });
    if (!item) return res.status(404).json({ error: "Item not found" });

    res.json({
      itemId: item.id,
      name: item.name,
      description: item.description,
      sourceLanguage: req.org.defaultLanguage || "en",
      enabledLanguages: req.org.enabledLanguages || [],
      translations: item.translations.map(t => ({
        language: t.language,
        name: t.name,
        description: t.description,
        isManualOverride: t.isManualOverride,
      })),
    });
  } catch (err) { next(err); }
});

/**
 * PATCH /api/translations/item/:id/:lang
 * Manuel çeviri override
 */
router.patch("/item/:id/:lang", requireAuth, async (req, res, next) => {
  try {
    const item = await prisma.menuItem.findFirst({
      where: { id: req.params.id, organizationId: req.org.id },
    });
    if (!item) return res.status(404).json({ error: "Item not found" });

    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: "Name required" });

    const t = await prisma.menuItemTranslation.upsert({
      where: { menuItemId_language: { menuItemId: item.id, language: req.params.lang } },
      create: {
        menuItemId: item.id,
        language: req.params.lang,
        name,
        description: description || null,
        isManualOverride: true,
      },
      update: {
        name,
        description: description || null,
        isManualOverride: true,
      },
    });
    res.json(t);
  } catch (err) { next(err); }
});

/**
 * DELETE /api/translations/item/:id/:lang
 * Bir çeviriyi kaldır (re-translate yapılırsa AI tekrar çevirir)
 */
router.delete("/item/:id/:lang", requireAuth, async (req, res, next) => {
  try {
    const item = await prisma.menuItem.findFirst({
      where: { id: req.params.id, organizationId: req.org.id },
    });
    if (!item) return res.status(404).json({ error: "Item not found" });

    await prisma.menuItemTranslation.deleteMany({
      where: { menuItemId: item.id, language: req.params.lang },
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/**
 * Tek item için tek bir dile çeviri yap (yeni item eklendiğinde async olarak çağrılır)
 * Internal kullanım için, ama API'den de erişilebilir
 */
router.post("/item/:id/translate", requireAuth, async (req, res, next) => {
  try {
    const item = await prisma.menuItem.findFirst({
      where: { id: req.params.id, organizationId: req.org.id },
    });
    if (!item) return res.status(404).json({ error: "Item not found" });

    const targetLanguages = Array.isArray(req.body.languages) && req.body.languages.length > 0
      ? req.body.languages
      : (req.org.enabledLanguages || []);

    const sourceLanguage = req.org.defaultLanguage || "en";
    const results = [];

    for (const lang of targetLanguages) {
      const result = await translateItem(
        { name: item.name, description: item.description, isProperName: item.isProperName, category: item.category },
        sourceLanguage,
        lang
      );
      if (result) {
        await prisma.menuItemTranslation.upsert({
          where: { menuItemId_language: { menuItemId: item.id, language: lang } },
          create: {
            menuItemId: item.id,
            language: lang,
            name: result.name,
            description: result.description,
            isManualOverride: false,
          },
          update: {
            name: result.name,
            description: result.description,
            isManualOverride: false,
          },
        });
        results.push({ language: lang, success: true });
      } else {
        results.push({ language: lang, success: false });
      }
    }

    res.json({ results });
  } catch (err) { next(err); }
});

module.exports = router;
