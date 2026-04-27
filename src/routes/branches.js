const router = require("express").Router();
const { PrismaClient } = require("@prisma/client");
const { requireAuth } = require("../middleware/auth");

const prisma = new PrismaClient();

function slugify(str) {
  return (str || "")
    .toLowerCase()
    .replace(/ğ/g,"g").replace(/ü/g,"u").replace(/ş/g,"s")
    .replace(/ı/g,"i").replace(/ö/g,"o").replace(/ç/g,"c")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 40) || "branch";
}

async function uniqueBranchSlug(orgId, base, excludeId) {
  let slug = slugify(base);
  let i = 2;
  while (true) {
    const exists = await prisma.branch.findFirst({
      where: { organizationId: orgId, slug, id: { not: excludeId } },
    });
    if (!exists) return slug;
    slug = slugify(base) + "-" + i++;
  }
}

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const branches = await prisma.branch.findMany({
      where: { organizationId: req.org.id },
      orderBy: { createdAt: "asc" },
    });
    res.json(branches);
  } catch (err) { next(err); }
});

router.post("/", requireAuth, async (req, res, next) => {
  try {
    const { name, country, city, address, postalCode, phone, googleMapsUrl, googlePlaceId, latitude, longitude, workingHours, active } = req.body;
    if (!name) return res.status(400).json({ error: "Branch name required" });
    const slug = await uniqueBranchSlug(req.org.id, name);
    const branch = await prisma.branch.create({
      data: {
        organizationId: req.org.id,
        name, slug, active: active !== false,
        country, city, address, postalCode, phone,
        googleMapsUrl, googlePlaceId, latitude, longitude, workingHours,
      },
    });
    res.status(201).json(branch);
  } catch (err) { next(err); }
});

router.patch("/:id", requireAuth, async (req, res, next) => {
  try {
    const branch = await prisma.branch.findFirst({
      where: { id: req.params.id, organizationId: req.org.id },
    });
    if (!branch) return res.status(404).json({ error: "Branch not found" });

    const allowed = ["name", "active", "country", "city", "address", "postalCode", "phone", "googleMapsUrl", "googlePlaceId", "latitude", "longitude", "workingHours"];
    const data = {};
    for (const k of allowed) if (req.body[k] !== undefined) data[k] = req.body[k];
    if (data.name && data.name !== branch.name) {
      data.slug = await uniqueBranchSlug(req.org.id, data.name, req.params.id);
    }
    const updated = await prisma.branch.update({
      where: { id: req.params.id },
      data,
    });
    res.json(updated);
  } catch (err) { next(err); }
});

router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const branch = await prisma.branch.findFirst({
      where: { id: req.params.id, organizationId: req.org.id },
    });
    if (!branch) return res.status(404).json({ error: "Branch not found" });
    const count = await prisma.branch.count({ where: { organizationId: req.org.id } });
    if (count <= 1) return res.status(400).json({ error: "Cannot delete the only branch" });
    await prisma.branch.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
