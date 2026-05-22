# MenuSwipe Backend

Visual restaurant menu SaaS. Restaurants upload photos, get a QR code, customers swipe through the menu.

---

## Stack

- **Express** — API server
- **Prisma + PostgreSQL** — database & ORM
- **Stripe** — subscription billing
- **qrcode** — QR code generation
- **sharp** — image resize & optimization
- **JWT** — authentication

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy env file and fill in values
cp .env.example .env

# 3. Create database and push schema
npx prisma db push

# 4. Generate Prisma client
npx prisma generate

# 5. Seed demo data (optional)
node prisma/seed.js

# 6. Start dev server
npm run dev
```

---

## Stripe Setup (Step by Step)

### 1. Create account
Go to https://dashboard.stripe.com and create an account.
Set business type to "Software / SaaS".

### 2. Get API keys
Dashboard → Developers → API keys
Copy `Publishable key` and `Secret key` into `.env`.

### 3. Create Products & Prices
Dashboard → Products → Add product

Create **3 products**:

| Product | Monthly Price (TRY) | Annual Price (TRY) |
|---------|--------------------|--------------------|
| Starter | ₺499 | ₺4,790 (~20% off) |
| Pro     | ₺899 | ₺8,630 (~20% off) |
| Chain   | ₺2,499 | ₺23,990 (~20% off) |

For each price: set **Recurring**, currency **TRY**, billing period **Monthly** or **Yearly**.
Copy each `price_id` (starts with `price_`) into `.env`.

### 4. Register Webhook
Dashboard → Developers → Webhooks → Add endpoint

- **Endpoint URL**: `https://your-domain.com/api/stripe/webhook`
- **Events to listen**:
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`

Copy the **Signing secret** (`whsec_...`) into `.env` as `STRIPE_WEBHOOK_SECRET`.

### 5. Test locally with Stripe CLI
```bash
# Install Stripe CLI: https://stripe.com/docs/stripe-cli
stripe listen --forward-to localhost:3000/api/stripe/webhook

# Trigger a test event
stripe trigger invoice.payment_succeeded
```

---

## API Reference

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create org + owner account |
| POST | `/api/auth/login` | Login, returns JWT |
| GET | `/api/auth/me` | Get current user |

**Register body:**
```json
{
  "restaurantName": "Ortaya",
  "email": "admin@ortaya.com",
  "password": "yourpassword",
  "name": "Admin Name"
}
```

---

### Menu Items (requires Bearer token)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/menu` | List all items |
| POST | `/api/menu` | Create item |
| PATCH | `/api/menu/:id` | Update item |
| DELETE | `/api/menu/:id` | Delete item |
| POST | `/api/menu/:id/photos` | Upload photo (multipart, max 3) |
| DELETE | `/api/menu/:id/photos/:photoId` | Delete photo |
| PATCH | `/api/menu/:id/photos/reorder` | Reorder photos |

**Create item body:**
```json
{
  "name": "Lamb Tandır",
  "description": "Slow-cooked for 12 hours",
  "price": 485,
  "category": "MAIN"
}
```

Categories: `MAIN`, `STARTER`, `DRINK`, `DESSERT`, `OTHER`

**Upload photo:** `multipart/form-data` with field `photo` (image file).
Images are auto-resized to 1080×1920 and converted to WebP.

---

### Branches (requires Bearer token)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/branches` | List branches |
| POST | `/api/branches` | Add branch (Chain plan only) |
| PATCH | `/api/branches/:id` | Update branch |
| DELETE | `/api/branches/:id` | Remove branch |
| PATCH | `/api/branches/settings` | Toggle shareMenu / priceOverride |
| POST | `/api/branches/:id/price-override` | Set branch price for an item |
| POST | `/api/branches/:id/track-view` | Increment view counter |
| POST | `/api/branches/:id/track-qr` | Increment QR scan counter |

---

### QR Codes (requires Bearer token)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/qr/:branchId` | Get QR as base64 PNG |
| GET | `/api/qr/:branchId/svg` | Get QR as SVG |
| POST | `/api/qr/:branchId/save` | Save QR to disk + update branch |

**Query params for GET:** `?color=%231a1a1a&bg=%23ffffff&size=400`

---

### Stripe (requires Bearer token)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/stripe/create-checkout` | Start subscription checkout |
| POST | `/api/stripe/create-portal` | Open Stripe billing portal |
| POST | `/api/stripe/change-plan` | Upgrade / downgrade plan |
| GET | `/api/stripe/invoices` | Transaction history |
| POST | `/api/stripe/webhook` | Stripe webhook (no auth) |

**Checkout body:**
```json
{ "plan": "PRO", "cycle": "MONTHLY" }
```

---

### Public (no auth — customer-facing)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/public/:orgSlug` | Full menu (shared) |
| GET | `/api/public/:orgSlug/:branchSlug` | Branch menu with price overrides |

Add `?ref=qr` to the URL when linking from QR codes — it auto-increments the QR scan counter.

**Example customer URL:** `https://your-domain.com/api/public/ortaya/karakoy?ref=qr`

---

## Plan Limits

| Feature | Starter | Pro | Chain |
|---------|---------|-----|-------|
| Menu items | 20 | Unlimited | Unlimited |
| Photos per item | 2 | 3 | 3 |
| Branches | 1 | 1 | 5 |
| Branch price override | No | No | Yes |
| Central analytics | No | Yes | Yes |
| White-label | No | No | Yes |

---

## Deployment Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Use a managed PostgreSQL (Railway, Supabase, or RDS)
- [ ] Switch `UPLOAD_DIR` to S3-compatible storage for photo uploads
- [ ] Set `APP_URL` to your production domain
- [ ] Register Stripe webhook with production endpoint
- [ ] Switch Stripe keys from `sk_test_` to `sk_live_`
- [ ] Run `npx prisma migrate deploy` (not `db push`) in production
