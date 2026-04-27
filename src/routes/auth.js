const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");
const { requireAuth } = require("../middleware/auth");

const prisma = new PrismaClient();

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "30d",
  });
}

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/ğ/g,"g").replace(/ü/g,"u").replace(/ş/g,"s")
    .replace(/ı/g,"i").replace(/ö/g,"o").replace(/ç/g,"c")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 40);
}

async function uniqueSlug(base) {
  let slug = slugify(base) || "restaurant";
  let exists = await prisma.organization.findUnique({ where: { slug } });
  let i = 2;
  while (exists) {
    slug = slugify(base) + "-" + i++;
    exists = await prisma.organization.findUnique({ where: { slug } });
  }
  return slug;
}

router.post("/register", async (req, res, next) => {
  try {
    const { restaurantName, email, password } = req.body;
    if (!restaurantName || !email || !password)
      return res.status(400).json({ error: "restaurantName, email and password are required" });
    if (password.length < 6)
      return res.status(400).json({ error: "Password must be at least 6 characters" });

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return res.status(409).json({ error: "This email is already registered" });

    const slug = await uniqueSlug(restaurantName);
    const passwordHash = await bcrypt.hash(password, 12);

    const org = await prisma.organization.create({
      data: {
        name: restaurantName,
        slug,
        currency: "USD",
        users: {
          create: { email, passwordHash, name: restaurantName, role: "OWNER" },
        },
        branches: {
          create: { name: restaurantName, slug: "main", active: true },
        },
      },
      include: { users: true, branches: true },
    });

    const token = signToken(org.users[0].id);
    res.status(201).json({
      token,
      organization: orgPublic(org),
    });
  } catch (err) { next(err); }
});

router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });

    const user = await prisma.user.findUnique({
      where: { email },
      include: { organization: true },
    });

    if (!user || !(await bcrypt.compare(password, user.passwordHash)))
      return res.status(401).json({ error: "Invalid email or password" });

    const token = signToken(user.id);
    res.json({ token, organization: orgPublic(user.organization) });
  } catch (err) { next(err); }
});

router.get("/me", requireAuth, (req, res) => {
  res.json({
    id: req.user.id,
    email: req.user.email,
    name: req.user.name,
    organization: orgPublic(req.org),
  });
});

// Profil güncelleme - tüm alanları kabul et
router.patch("/organization", requireAuth, async (req, res, next) => {
  try {
    const allowed = [
      "name", "logoUrl", "accentColor", "currency",
      "phone", "website", "instagram", "facebook",
      "country", "city", "address", "postalCode",
      "googleMapsUrl", "googlePlaceId", "latitude", "longitude",
      "workingHours"
    ];
    const data = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) data[key] = req.body[key];
    }
    const org = await prisma.organization.update({
      where: { id: req.org.id },
      data,
    });
    res.json(orgPublic(org));
  } catch (err) { next(err); }
});

function orgPublic(o) {
  return {
    id: o.id, name: o.name, slug: o.slug,
    logoUrl: o.logoUrl, accentColor: o.accentColor, currency: o.currency || "USD",
    phone: o.phone, website: o.website, instagram: o.instagram, facebook: o.facebook,
    country: o.country, city: o.city, address: o.address, postalCode: o.postalCode,
    googleMapsUrl: o.googleMapsUrl, googlePlaceId: o.googlePlaceId,
    latitude: o.latitude, longitude: o.longitude,
    workingHours: o.workingHours,
    plan: o.plan,
  };
}

module.exports = router;
