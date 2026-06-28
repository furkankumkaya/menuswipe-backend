const router = require("express").Router();
const multer = require("multer");
const { PrismaClient } = require("@prisma/client");
const { requireAuth } = require("../middleware/auth");
const { extractMenuFromFiles } = require("../services/ai");

const prisma = new PrismaClient();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 30 },
  fileFilter: (_, file, cb) => {
    const ok = file.mimetype === "application/pdf" || file.mimetype.startsWith("image/");
    if (!ok) return cb(new Error("Only PDF and image files allowed"));
    cb(null, true);
  },
});

// In-memory job storage (Railway tek replica olduğu için yeterli)
const jobs = new Map();

function makeJobId() {
  return "job_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10);
}

/**
 * POST /api/import/upload
 * Çoklu dosya alır, async parsing job başlatır
 */
router.post("/upload", requireAuth, upload.array("files", 30), async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    // Toplam boyut kontrolü
    const totalSize = req.files.reduce((s, f) => s + f.size, 0);
    if (totalSize > 25 * 1024 * 1024) {
      return res.status(400).json({ error: "Total file size exceeds 25MB" });
    }

    const jobId = makeJobId();
    const sourceLanguage = req.body.sourceLanguage || req.org.defaultLanguage || "en";
    const currency = req.body.currency || req.org.currency || "USD";

    jobs.set(jobId, {
      id: jobId,
      orgId: req.org.id,
      status: "processing",
      fileNames: req.files.map(f => f.originalname),
      progress: "Analyzing menu...",
      result: null,
      error: null,
      createdAt: new Date(),
    });

    // Async parse - response'u bekletmiyoruz
    (async () => {
      try {
        const result = await extractMenuFromFiles(
          req.files.map(f => ({ buffer: f.buffer, mimetype: f.mimetype, originalname: f.originalname })),
          sourceLanguage,
          currency
        );
        const job = jobs.get(jobId);
        if (job) {
          job.status = "ready";
          job.result = result;
          job.progress = "Ready for review";
        }
      } catch (err) {
        console.error("Import job failed:", err);
        const job = jobs.get(jobId);
        if (job) {
          job.status = "failed";
          job.error = err.message || "Failed to parse menu";
        }
      }
    })();

    res.status(202).json({ jobId, status: "processing" });
  } catch (err) { next(err); }
});

/**
 * GET /api/import/job/:id - status sorgular
 */
router.get("/job/:id", requireAuth, (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found" });
  if (job.orgId !== req.org.id) return res.status(403).json({ error: "Forbidden" });

  res.json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    fileNames: job.fileNames,
    error: job.error,
    result: job.status === "ready" ? job.result : null,
  });
});

/**
 * POST /api/import/job/:id/apply
 * Önizlemede onaylanan item'ları database'e yazar
 * Body: { items: [...], categoryMapping: { "Pizza": "MAIN" | "newCategoryCode" } }
 */
router.post("/job/:id/apply", requireAuth, async (req, res, next) => {
  try {
    const job = jobs.get(req.params.id);
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (job.orgId !== req.org.id) return res.status(403).json({ error: "Forbidden" });

    const { items, createCategories } = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: "items array required" });

    // Aktif şubeleri al (yeni item'lar tüm aktif şubelere atanır)
    const branches = await prisma.branch.findMany({
      where: { organizationId: req.org.id, active: true },
      select: { id: true },
    });
    if (branches.length === 0) return res.status(400).json({ error: "No active branches" });
    const branchIds = branches.map(b => b.id);

    // Kullanıcının istediği yeni kategorileri oluştur
    const existingCats = await prisma.category.findMany({
      where: { organizationId: req.org.id },
    });
    const codeByLabel = {};
    for (const c of existingCats) codeByLabel[c.label.toLowerCase()] = c.code;

    if (Array.isArray(createCategories)) {
      const lastCat = await prisma.category.findFirst({
        where: { organizationId: req.org.id },
        orderBy: { sortOrder: "desc" },
      });
      let nextSort = lastCat ? lastCat.sortOrder + 1 : 0;
      for (const newCat of createCategories) {
        const lbl = (newCat.label || "").trim();
        if (!lbl) continue;
        if (codeByLabel[lbl.toLowerCase()]) continue; // zaten var
        const code = "C" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
        const created = await prisma.category.create({
          data: {
            organizationId: req.org.id,
            code,
            label: lbl,
            color: newCat.color || "#8E1616",
            visible: true,
            sortOrder: nextSort++,
          },
        });
        codeByLabel[lbl.toLowerCase()] = created.code;
      }
    }

    // Item'ları yarat
    const created = [];
    let sortOrder = (await prisma.menuItem.count({ where: { organizationId: req.org.id } })) || 0;

    for (const it of items) {
      const name = (it.name || "").trim();
      if (!name) continue;
      const catLabel = (it.category || "").trim();
      const categoryCode = codeByLabel[catLabel.toLowerCase()] || "MAIN";

      try {
        const item = await prisma.menuItem.create({
          data: {
            organizationId: req.org.id,
            name,
            description: (it.description || "").slice(0, 500) || null,
            price: parseFloat(it.price) || 0,
            category: categoryCode,
            sortOrder: sortOrder++,
            itemBranches: {
              create: branchIds.map(bid => ({ branchId: bid })),
            },
          },
        });
        created.push(item.id);
      } catch (e) {
        console.error("Failed to create item:", name, e.message);
      }
    }

    // Job'u temizle
    jobs.delete(req.params.id);

    res.json({ success: true, createdCount: created.length });
  } catch (err) { next(err); }
});

/**
 * DELETE /api/import/job/:id - cancel
 */
router.delete("/job/:id", requireAuth, (req, res) => {
  const job = jobs.get(req.params.id);
  if (job && job.orgId === req.org.id) jobs.delete(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
