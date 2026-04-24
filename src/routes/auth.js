// src/routes/auth.js
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

// POST /api/auth/register
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
        users: {
          create: { email, passwordHash, name: restaurantName, role: "OWNER" },
        },
        branches: {
          create: { name: restaurantName, slug: "main", active: true },
        },
      },
      include: { users: true },
    });

    const token = signToken(org.users[0].id);
    res.status(201).json({
      token,
      organization: { id: org.id, name: org.name, slug: org.slug },
    });
  } catch (err) { next(err); }
});

// POST /api/auth/login
router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: "Email and password required" });

    const user = await prisma.user.findUnique({
      where: { email },
      include: { organization: true },
    });

    if (!user || !(await bcrypt.compare(password, user.passwordHash)))
      return res.status(401).json({ error: "Invalid email or password" });

    const token = signToken(user.id);
    res.json({
      token,
      organization: {
        id: user.organization.id,
        name: user.organization.name,
        slug: user.organization.slug,
        logoUrl: user.organization.logoUrl,
        accentColor: user.organization.accentColor,
        plan: user.organization.plan,
      },
    });
  } catch (err) { next(err); }
});

// GET /api/auth/me
router.get("/me", requireAuth, (req, res) => {
  const { passwordHash, ...user } = req.user;
  res.json({
    ...user,
    organization: {
      id: req.org.id,
      name: req.org.name,
      slug: req.org.slug,
      logoUrl: req.org.logoUrl,
      accentColor: req.org.accentColor,
      plan: req.org.plan,
    },
  });
});

// PATCH /api/auth/organization
router.patch("/organization", requireAuth, async (req, res, next) => {
  try {
    const { name, accentColor } = req.body;
    const data = {};
    if (name) data.name = name;
    if (accentColor) data.accentColor = accentColor;
    const org = await prisma.organization.update({
      where: { id: req.org.id },
      data,
    });
    res.json({ id: org.id, name: org.name, slug: org.slug, logoUrl: org.logoUrl, accentColor: org.accentColor });
  } catch (err) { next(err); }
});

module.exports = router;
