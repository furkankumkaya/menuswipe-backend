// src/routes/stripe.js
const router = require("express").Router();
const Stripe = require("stripe");
const { PrismaClient } = require("@prisma/client");
const { requireAuth } = require("../middleware/auth");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const prisma = new PrismaClient();

// ─── Price ID map ────────────────────────────────────
const PRICE_IDS = {
  STARTER: {
    MONTHLY: process.env.STRIPE_PRICE_STARTER_MONTHLY,
    ANNUAL: process.env.STRIPE_PRICE_STARTER_ANNUAL,
  },
  PRO: {
    MONTHLY: process.env.STRIPE_PRICE_PRO_MONTHLY,
    ANNUAL: process.env.STRIPE_PRICE_PRO_ANNUAL,
  },
  CHAIN: {
    MONTHLY: process.env.STRIPE_PRICE_CHAIN_MONTHLY,
    ANNUAL: process.env.STRIPE_PRICE_CHAIN_ANNUAL,
  },
};

// Map Stripe price ID → plan name
function planFromPriceId(priceId) {
  for (const [plan, cycles] of Object.entries(PRICE_IDS)) {
    for (const pid of Object.values(cycles)) {
      if (pid === priceId) return plan;
    }
  }
  return "STARTER";
}

function cycleFromPriceId(priceId) {
  for (const cycles of Object.values(PRICE_IDS)) {
    if (cycles.ANNUAL === priceId) return "ANNUAL";
    if (cycles.MONTHLY === priceId) return "MONTHLY";
  }
  return "MONTHLY";
}

// ─── POST /api/stripe/create-checkout ───────────────
// Create Stripe Checkout session (subscription)
router.post("/create-checkout", requireAuth, async (req, res, next) => {
  try {
    const { plan = "PRO", cycle = "MONTHLY" } = req.body;
    const priceId = PRICE_IDS[plan]?.[cycle];
    if (!priceId) return res.status(400).json({ error: "Invalid plan or cycle" });

    // Get or create Stripe customer
    let customerId = req.org.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: req.user.email,
        name: req.org.name,
        metadata: { organizationId: req.org.id },
      });
      customerId = customer.id;
      await prisma.organization.update({
        where: { id: req.org.id },
        data: { stripeCustomerId: customerId },
      });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.APP_URL}/dashboard?checkout=success`,
      cancel_url: `${process.env.APP_URL}/dashboard/billing?checkout=cancelled`,
      metadata: { organizationId: req.org.id },
      subscription_data: {
        metadata: { organizationId: req.org.id },
      },
      // Allow promotion codes
      allow_promotion_codes: true,
    });

    res.json({ url: session.url });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/stripe/create-portal ─────────────────
// Stripe Customer Portal (manage card, cancel, invoice history)
router.post("/create-portal", requireAuth, async (req, res, next) => {
  try {
    if (!req.org.stripeCustomerId) {
      return res.status(400).json({ error: "No active subscription found" });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: req.org.stripeCustomerId,
      return_url: `${process.env.APP_URL}/dashboard/billing`,
    });

    res.json({ url: session.url });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/stripe/change-plan ───────────────────
// Upgrade or downgrade immediately (prorated)
router.post("/change-plan", requireAuth, async (req, res, next) => {
  try {
    const { plan, cycle = "MONTHLY" } = req.body;
    const priceId = PRICE_IDS[plan]?.[cycle];
    if (!priceId) return res.status(400).json({ error: "Invalid plan or cycle" });
    if (!req.org.stripeSubscriptionId) {
      return res.status(400).json({ error: "No active subscription" });
    }

    const subscription = await stripe.subscriptions.retrieve(req.org.stripeSubscriptionId);
    const itemId = subscription.items.data[0].id;

    await stripe.subscriptions.update(req.org.stripeSubscriptionId, {
      items: [{ id: itemId, price: priceId }],
      proration_behavior: "always_invoice",
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/stripe/invoices ────────────────────────
router.get("/invoices", requireAuth, async (req, res, next) => {
  try {
    const txs = await prisma.transaction.findMany({
      where: { organizationId: req.org.id },
      orderBy: { createdAt: "desc" },
      take: 24,
    });
    res.json(txs);
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/stripe/webhook ────────────────────────
// Stripe sends events here. Registered in Stripe Dashboard.
// Must be raw body (handled in index.js before json middleware)
router.post("/webhook", async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook signature error:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      // ── Subscription created or updated ──────────
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object;
        const orgId = sub.metadata?.organizationId;
        if (!orgId) break;

        const priceId = sub.items.data[0]?.price?.id;
        const plan = planFromPriceId(priceId);
        const cycle = cycleFromPriceId(priceId);

        await prisma.organization.update({
          where: { id: orgId },
          data: {
            stripeSubscriptionId: sub.id,
            stripePriceId: priceId,
            plan,
            billingCycle: cycle,
            planStatus: mapSubStatus(sub.status),
            currentPeriodEnd: new Date(sub.current_period_end * 1000),
          },
        });
        break;
      }

      // ── Subscription cancelled ────────────────────
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const orgId = sub.metadata?.organizationId;
        if (!orgId) break;

        await prisma.organization.update({
          where: { id: orgId },
          data: {
            plan: "STARTER",
            planStatus: "CANCELLED",
            stripeSubscriptionId: null,
          },
        });
        break;
      }

      // ── Invoice paid → record transaction ────────
      case "invoice.payment_succeeded": {
        const invoice = event.data.object;
        const orgId = invoice.subscription_details?.metadata?.organizationId
          || invoice.metadata?.organizationId;

        if (orgId && invoice.amount_paid > 0) {
          await prisma.transaction.create({
            data: {
              organizationId: orgId,
              stripeInvoiceId: invoice.id,
              amount: invoice.amount_paid,
              currency: invoice.currency,
              status: "PAID",
              description: invoice.lines?.data[0]?.description || "Subscription",
              periodStart: invoice.period_start
                ? new Date(invoice.period_start * 1000)
                : null,
              periodEnd: invoice.period_end
                ? new Date(invoice.period_end * 1000)
                : null,
            },
          });

          // Keep planStatus in sync
          await prisma.organization.updateMany({
            where: { id: orgId },
            data: { planStatus: "ACTIVE" },
          });
        }
        break;
      }

      // ── Invoice failed ────────────────────────────
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const orgId = invoice.subscription_details?.metadata?.organizationId;
        if (!orgId) break;

        await prisma.transaction.create({
          data: {
            organizationId: orgId,
            stripeInvoiceId: invoice.id,
            amount: invoice.amount_due,
            currency: invoice.currency,
            status: "FAILED",
            description: "Payment failed",
          },
        });

        await prisma.organization.updateMany({
          where: { id: orgId },
          data: { planStatus: "PAST_DUE" },
        });
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error("Webhook handler error:", err);
  }

  res.json({ received: true });
});

function mapSubStatus(stripeStatus) {
  const map = {
    active: "ACTIVE",
    trialing: "TRIALING",
    past_due: "PAST_DUE",
    canceled: "CANCELLED",
    unpaid: "PAST_DUE",
  };
  return map[stripeStatus] || "ACTIVE";
}

module.exports = router;
