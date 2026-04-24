// src/routes/auth.js
const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");
const { requireAuth } = require("../middleware/auth");

const prisma = new PrismaClient();

function slugify(str) {
  return str.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
}

// POST /api/auth/register
// Creates organization + first admin user
router.post("/register", async (req, res, next) => {
  try {
    const { restaurantName, email, password, name } = req.body;

    if (!restaurantName || !email || !password) {
      return res.status(400).json({ error: "restaurantName, email and password are required" });
    }

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return res.status(409).json({ error: "Email already in use" });

    const baseSlug = slugify(restaurantName);
    let slug = baseSlug;
    let attempt = 1;
    while (await prisma.organization.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${attempt++}`;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const org = await prisma.organization.create({
      data: {
        name: restaurantName,
        slug,
        users: {
          create: { email, passwordHash, name, role: "OWNER" },
        },
        // Create a default branch matching the org
        branches: {
          create: { name: restaurantName, slug: "main", active: true },
        },
      },
      include: { users: true },
    });

    const token = signToken(org.users[0].id);
    res.status(201).json({ token, slug });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({
      where: { email },
      include: { organization: true },
    });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = signToken(user.id);
    res.json({ token, organization: { id: user.organization.id, slug: user.organization.slug, plan: user.organization.plan } });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get("/me", requireAuth, (req, res) => {
  const { passwordHash, ...user } = req.user;
  res.json(user);
});

module.exports = router;
