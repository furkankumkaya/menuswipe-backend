// src/routes/demo.js
const router = require("express").Router();
const { PrismaClient } = require("@prisma/client");
const { requireAuth } = require("../middleware/auth");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const prisma = new PrismaClient();

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "30d",
  });
}

// Sales veya Admin rolü gerektirir
function requireSalesRole(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  const allowed = ["SALES", "ADMIN", "OWNER"]; // OWNER kendi hesabı için
  // OWNER ise sadece DEMO_ALLOW_ALL_OWNERS=true ise izin ver
  if (req.user.role === "OWNER" && process.env.DEMO_ALLOW_ALL_OWNERS !== "true") {
    return res.status(403).json({ error: "Demo mode requires SALES role" });
  }
  if (!allowed.includes(req.user.role)) {
    return res.status(403).json({ error: "Demo mode requires SALES role" });
  }
  next();
}

// ─── POST /api/demo/grant-sales ─────────────────────
// Bir kullanıcıya SALES rolü ver (sadece admin secret ile)
router.post("/grant-sales", async (req, res, next) => {
  try {
    const { email, adminSecret } = req.body;
    if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
      return res.status(403).json({ error: "Invalid admin secret" });
    }
    if (!email) return res.status(400).json({ error: "Email required" });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: "User not found" });

    await prisma.user.update({
      where: { email },
      data: { role: "SALES" },
    });

    res.json({ ok: true, message: `${email} is now a SALES user` });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/demo/revoke-sales ────────────────────
// SALES rolünü geri al
router.post("/revoke-sales", async (req, res, next) => {
  try {
    const { email, adminSecret } = req.body;
    if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
      return res.status(403).json({ error: "Invalid admin secret" });
    }
    if (!email) return res.status(400).json({ error: "Email required" });

    await prisma.user.update({
      where: { email },
      data: { role: "OWNER" },
    });

    res.json({ ok: true, message: `${email} role reverted to OWNER` });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/demo/my-role ──────────────────────────
// Kullanıcının rolünü döner (frontend demo section için)
router.get("/my-role", requireAuth, async (req, res) => {
  res.json({
    role: req.user.role,
    isSales: ["SALES", "ADMIN"].includes(req.user.role),
  });
});

// ─── POST /api/demo/generate-claim ──────────────────
router.post("/generate-claim", requireAuth, requireSalesRole, async (req, res, next) => {
  try {
    // Eski süresi dolmuş token'ları temizle
    await prisma.claimToken.deleteMany({
      where: {
        sourceOrgId: req.org.id,
        claimedAt: null,
        expiresAt: { lt: new Date() },
      },
    });

    // Yeni token (48 saat geçerli)
    const token = crypto.randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    await prisma.claimToken.create({
      data: { token, sourceOrgId: req.org.id, expiresAt },
    });

    const claimUrl = `${process.env.APP_URL}/claim/${token}`;
    res.json({ token, claimUrl, expiresAt });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/demo/claim/:token ──────────────────────
router.get("/claim/:token", async (req, res, next) => {
  try {
    const claim = await prisma.claimToken.findUnique({
      where: { token: req.params.token },
      include: {
        sourceOrg: {
          select: { name: true, logoUrl: true, accentColor: true, country: true, city: true },
        },
      },
    });

    if (!claim) return res.status(404).json({ error: "Invalid or expired link" });
    if (claim.claimedAt) return res.status(410).json({ error: "This menu has already been claimed" });
    if (claim.expiresAt < new Date()) return res.status(410).json({ error: "This link has expired" });

    res.json({
      valid: true,
      restaurantName: claim.sourceOrg.name,
      restaurantLogoUrl: claim.sourceOrg.logoUrl,
      restaurantCity: claim.sourceOrg.city,
      restaurantCountry: claim.sourceOrg.country,
      expiresAt: claim.expiresAt,
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/demo/claim/:token ─────────────────────
router.post("/claim/:token", async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email and password are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const claim = await prisma.claimToken.findUnique({
      where: { token: req.params.token },
    });

    if (!claim) return res.status(404).json({ error: "Invalid link" });
    if (claim.claimedAt) return res.status(410).json({ error: "Already claimed" });
    if (claim.expiresAt < new Date()) return res.status(410).json({ error: "Link expired" });

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) return res.status(409).json({ error: "An account with this email already exists" });

    const sourceOrg = await prisma.organization.findUnique({
      where: { id: claim.sourceOrgId },
      include: {
        menuItems: { include: { photos: true, translations: true } },
        categories: { include: { translations: true } },
      },
    });

    if (!sourceOrg) return res.status(404).json({ error: "Source menu not found" });

    function slugify(str) {
      return str.toLowerCase()
        .replace(/ğ/g,"g").replace(/ü/g,"u").replace(/ş/g,"s")
        .replace(/ı/g,"i").replace(/ö/g,"o").replace(/ç/g,"c")
        .replace(/\s+/g,"-").replace(/[^a-z0-9-]/g,"").slice(0,40);
    }

    let slug = slugify(name) || "restaurant";
    const existingSlug = await prisma.organization.findUnique({ where: { slug } });
    if (existingSlug) slug = slug + "-" + Date.now().toString().slice(-4);

    const passwordHash = await bcrypt.hash(password, 10);
    const trialEndsAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);

    const result = await prisma.$transaction(async (tx) => {
      const newOrg = await tx.organization.create({
        data: {
          name,
          slug,
          currency: sourceOrg.currency || "USD",
          defaultLanguage: sourceOrg.defaultLanguage || "en",
          enabledLanguages: sourceOrg.enabledLanguages || [],
          accentColor: sourceOrg.accentColor || "#8E1616",
          country: sourceOrg.country,
          city: sourceOrg.city,
          plan: "TRIAL",
          planStatus: "TRIAL",
          trialEndsAt,
          onboardingCompleted: true,
        },
      });

      const newUser = await tx.user.create({
        data: { email, passwordHash, name, role: "OWNER", organizationId: newOrg.id },
      });

      await tx.branch.create({
        data: { organizationId: newOrg.id, name, slug: "main", active: true },
      });

      // Kategorileri kopyala
      const catMap = {};
      for (const cat of sourceOrg.categories) {
        const newCat = await tx.category.create({
          data: {
            organizationId: newOrg.id,
            code: cat.code, label: cat.label,
            color: cat.color, visible: cat.visible, sortOrder: cat.sortOrder,
          },
        });
        catMap[cat.id] = newCat.id;
        for (const tr of cat.translations) {
          await tx.categoryTranslation.create({
            data: { categoryId: newCat.id, language: tr.language, label: tr.label, isManualOverride: tr.isManualOverride },
          });
        }
      }

      // Menü itemlarını kopyala
      for (const item of sourceOrg.menuItems) {
        const newItem = await tx.menuItem.create({
          data: {
            organizationId: newOrg.id,
            name: item.name, description: item.description, price: item.price,
            category: item.category, active: item.active,
            isBestseller: item.isBestseller, isProperName: item.isProperName,
            tagMarketing: item.tagMarketing, tagDietary: item.tagDietary,
            allergens: item.allergens, sortOrder: item.sortOrder,
          },
        });

        for (const photo of item.photos) {
          await tx.menuPhoto.create({
            data: { menuItemId: newItem.id, url: photo.url, cloudinaryId: photo.cloudinaryId, sortOrder: photo.sortOrder },
          });
        }

        for (const tr of item.translations) {
          await tx.menuItemTranslation.create({
            data: { menuItemId: newItem.id, language: tr.language, name: tr.name, description: tr.description, isManualOverride: tr.isManualOverride },
          });
        }
      }

      await tx.claimToken.update({
        where: { token: req.params.token },
        data: { claimedAt: new Date(), claimedByOrgId: newOrg.id },
      });

      return { newOrg, newUser };
    });

    const jwtToken = signToken(result.newUser.id);
    res.json({
      token: jwtToken,
      organization: {
        id: result.newOrg.id,
        name: result.newOrg.name,
        slug: result.newOrg.slug,
        plan: result.newOrg.plan,
        planStatus: result.newOrg.planStatus,
        trialEndsAt: result.newOrg.trialEndsAt,
        onboardingCompleted: true,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
