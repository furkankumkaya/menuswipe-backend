// src/middleware/auth.js
const { PrismaClient } = require("@prisma/client");
const { verifyAuthToken } = require("../utils/jwt");
const prisma = new PrismaClient();

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }

    const token = header.slice(7);
    const payload = verifyAuthToken(token);

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { organization: true },
    });

    if (!user) return res.status(401).json({ error: "User not found" });

    req.user = user;

    // Sales demo mode: orgOverride ile farkli org'a erisim
    if (payload.orgOverride && user.role === "SALES") {
      const overrideOrg = await prisma.organization.findUnique({ where: { id: payload.orgOverride } });
      if (overrideOrg) {
        req.org = overrideOrg;
        req.salesMode = true;
        return next();
      }
    }

    req.org = user.organization;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// Plan limit checks
function requirePlan(...plans) {
  return (req, res, next) => {
    if (!plans.includes(req.org.plan)) {
      return res.status(403).json({
        error: `This feature requires one of: ${plans.join(", ")} plan`,
      });
    }
    next();
  };
}

module.exports = { requireAuth, requirePlan };
