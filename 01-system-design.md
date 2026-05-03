# Phase 1 — System Design & Architecture
## B2B Stationery Ordering Platform

**Target scale:** 100–1,000 concurrent users, ~500 orders/day, thousands of SKUs
**Stack:** React · Node/Express · MongoDB · Google OAuth · Socket.io · Razorpay

---

## 1. Architectural Style

**Decision: Modular Monolith (not microservices).**

At 500 orders/day and ~1K concurrent users, microservices would be premature optimization — more ops cost than benefit. Instead, we build a **single Node.js app** organized into clearly-bounded *service modules* (auth, catalog, orders, delivery, payments, feedback). Each module owns its routes, controllers, services, and data access. If one module later needs to be extracted into its own process, the boundaries are already clean.

**Why this matters for you:**
- One repo, one deploy, one set of env vars — fast to ship
- Module boundaries enforce discipline (no cross-service DB writes)
- Horizontally scalable by running multiple Node instances behind a load balancer (stateless app + sticky sockets)

---

## 2. High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                           CLIENT LAYER                              │
│                                                                     │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐      │
│   │ Client Web   │    │ Admin Web    │    │ Delivery Web     │      │
│   │ (React SPA)  │    │ (React SPA)  │    │ (React SPA)      │      │
│   │              │    │              │    │  — same app,     │      │
│   │              │    │              │    │    role-gated    │      │
│   └──────┬───────┘    └──────┬───────┘    └────────┬─────────┘      │
└──────────┼───────────────────┼─────────────────────┼────────────────┘
           │ HTTPS/REST        │ HTTPS/REST          │ HTTPS + WSS
           │ + WebSocket       │                     │ (live tracking)
           ▼                   ▼                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        API GATEWAY LAYER                           │
│                   (Nginx / Cloud LB — reverse proxy)                │
│           TLS termination · gzip · static assets · rate limit       │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      APPLICATION LAYER                              │
│                  Node.js + Express (stateless)                      │
│                                                                     │
│  ┌─────────────┐ ┌────────────┐ ┌─────────────┐ ┌───────────────┐   │
│  │   Auth      │ │  Catalog   │ │   Orders    │ │   Delivery    │   │
│  │  Service    │ │  Service   │ │   Service   │ │   Service     │   │
│  │ (Google     │ │ (Products, │ │ (Cart,      │ │ (Assignment,  │   │
│  │  OAuth+JWT) │ │  Inventory)│ │  Checkout)  │ │  Tracking)    │   │
│  └─────────────┘ └────────────┘ └─────────────┘ └───────────────┘   │
│                                                                     │
│  ┌─────────────┐ ┌────────────┐ ┌─────────────┐ ┌───────────────┐   │
│  │  Payments   │ │  Feedback  │ │   Invoice   │ │  Notification │   │
│  │  Service    │ │  Service   │ │   Service   │ │  Service      │   │
│  │ (Razorpay)  │ │ (Reviews)  │ │  (PDFKit)   │ │  (Socket.io)  │   │
│  └─────────────┘ └────────────┘ └─────────────┘ └───────────────┘   │
│                                                                     │
│  ── Cross-cutting: Logger · Error Handler · Validator · RBAC ──     │
└──────────┬──────────────────────────────────────────┬───────────────┘
           │                                          │
           ▼                                          ▼
┌─────────────────────────────┐      ┌──────────────────────────────┐
│         DATA LAYER          │      │       EXTERNAL SERVICES      │
│                             │      │                              │
│   ┌──────────────────┐      │      │   • Google OAuth 2.0         │
│   │     MongoDB      │      │      │   • Razorpay API             │
│   │  (Primary DB)    │      │      │   • SMTP (email — later)     │
│   │                  │      │      │                              │
│   │  users, products │      │      │                              │
│   │  orders, carts,  │      │      │                              │
│   │  deliveries,     │      │      │                              │
│   │  payments,       │      │      │                              │
│   │  invoices,       │      │      │                              │
│   │  feedback, logs  │      │      │                              │
│   └──────────────────┘      │      │                              │
│                             │      │                              │
│   ┌──────────────────┐      │      │                              │
│   │  Local FS / S3   │      │      │                              │
│   │  (product images,│      │      │                              │
│   │   invoice PDFs)  │      │      │                              │
│   └──────────────────┘      │      │                              │
└─────────────────────────────┘      └──────────────────────────────┘
```

---

## 3. MongoDB vs MySQL — The Call

**Decision: MongoDB only. No MySQL.**

You asked me to decide when to use which and *why*. Here's the honest answer: at this scale, adding MySQL alongside MongoDB buys you nothing except operational complexity (two backup strategies, two connection pools, two query languages, distributed transaction headaches).

**MongoDB wins here because:**

| Concern | Why Mongo handles it fine |
|---|---|
| **Products with varying attributes** (pens have ink type, notebooks have page count, etc.) | Document model is literally built for this |
| **Orders with nested line items** | Embedding `orderItems[]` inside an Order doc = one read for the full order |
| **Financial integrity (payments, invoices)** | Mongo has ACID transactions across documents since v4.0. We use them for the checkout flow |
| **Reporting / aggregations** | Mongo's aggregation pipeline is more than enough for admin dashboards at 500 orders/day |
| **Audit trail / immutable records** | Store invoice snapshots as separate immutable documents |

**When I'd reconsider and add MySQL:** if you later need heavy multi-table joins for BI reporting, or a finance team demands SQL for accounting reconciliation. At that point you'd add a read-replica ETL pipeline — not dual-write. For now, **one database, done right.**

---

## 4. Service Breakdown

Each service is a folder under `src/modules/` with its own routes, controller, service (business logic), model, and validator. They talk to each other *only* through service-layer function calls — never by reaching into each other's models.

### 4.1 Auth Service
- Google OAuth 2.0 via Passport.js (authorization code flow)
- Issues JWT access tokens (15 min) + refresh tokens (7 days, stored httpOnly cookie)
- Role-based access control middleware: `requireRole('admin' | 'client' | 'delivery')`
- First-time Google login auto-creates a `client` user. Admin promotes accounts to `admin`/`delivery` roles.

### 4.2 Catalog Service
- Product CRUD (admin only)
- Public product browse/search/filter with pagination
- Tiered bulk pricing: price drops at quantity thresholds (e.g. 1–49 units = ₹50, 50–199 = ₹45, 200+ = ₹40)
- Inventory tracking with atomic decrement on order confirmation
- Product image upload (multer → local FS now, S3 later)

### 4.3 Order Service
- Cart management (one active cart per client, persisted in Mongo)
- Checkout flow: validate inventory → create order (status: `pending_payment`) → trigger payment → on success, decrement inventory atomically inside a transaction
- Order lifecycle: `pending_payment → confirmed → processing → shipped → out_for_delivery → delivered` (plus `cancelled`, `rejected`, `refunded`)
- Admin can accept/reject, cancel, trigger refund

### 4.4 Delivery Service
- Assign delivery partner (admin action)
- Delivery partner marks status transitions via their dashboard
- Real-time location updates pushed via Socket.io room scoped to the order (`order:{orderId}`)
- Tracking events stored as an append-only array on the delivery document

### 4.5 Payment Service
- Razorpay order creation, signature verification webhook, refund API
- Payment records are **immutable** — never update, always append a new record
- Webhook handler is idempotent (keyed on Razorpay payment ID)

### 4.6 Invoice Service
- On order `confirmed`, generates a PDF invoice via PDFKit
- Stores PDF in FS/S3, stores metadata in Mongo (invoice number, total, GST breakdown, snapshot of line items)
- Invoice numbers are sequential per financial year (`INV-2026-00001`) — generated via a counter collection with `findOneAndUpdate` for atomicity

### 4.7 Feedback Service
- Rating (1–5) + review text, only allowed after order is `delivered`
- One review per order per client
- Aggregated product rating updated on review submit (incremental average, not recomputed)

### 4.8 Notification Service (cross-cutting)
- Socket.io rooms per user (`user:{userId}`) for targeted push
- Events: order status changes, delivery location updates, new order (admin room), assignment (delivery partner room)
- Email notifications deferred — design includes a `NotificationChannel` interface so we can plug in SMTP later without touching callers

---

## 5. Authentication & Authorization Flow

```
  Browser                  Frontend SPA              Backend API          Google
    │                           │                        │                  │
    │  clicks "Sign in"         │                        │                  │
    ├──────────────────────────▶│                        │                  │
    │                           │  GET /auth/google      │                  │
    │                           ├───────────────────────▶│                  │
    │                           │  302 redirect to Google│                  │
    │                           │◀───────────────────────┤                  │
    │  redirected to Google     │                        │                  │
    ├──────────────────────────────────────────────────────────────────────▶│
    │              user approves, Google redirects back with ?code=...      │
    │◀──────────────────────────────────────────────────────────────────────┤
    │  GET /auth/google/callback?code=...                                   │
    ├──────────────────────────────────────────────────▶│                  │
    │                           │                        │ exchange code    │
    │                           │                        │ for id_token     │
    │                           │                        ├─────────────────▶│
    │                           │                        │◀─────────────────┤
    │                           │                        │ upsert User      │
    │                           │                        │ (role=client)    │
    │                           │  set httpOnly cookie   │                  │
    │                           │  (refresh token) +     │                  │
    │                           │  redirect with access  │                  │
    │                           │  token in fragment     │                  │
    │◀──────────────────────────────────────────────────┤                  │
    │                           │  subsequent API calls  │                  │
    │                           │  Authorization: Bearer │                  │
    │                           ├───────────────────────▶│                  │
```

**Access token** — short-lived JWT in memory (React context). Never in localStorage.
**Refresh token** — httpOnly, Secure, SameSite=Strict cookie. Rotated on use.
**Role checks** — done server-side in middleware, never trusted from client.

---

## 6. Real-Time Layer (Socket.io)

Three room patterns:

| Room name | Who joins | Events published |
|---|---|---|
| `user:{userId}` | That user's active browser tabs | `order.updated`, `payment.updated` |
| `order:{orderId}` | Client who owns it + assigned delivery partner + admins | `delivery.location`, `delivery.status` |
| `admin` | All logged-in admins | `order.new`, `order.needsAction` |

Socket handshake is authenticated by the same JWT used for REST. Invalid token = instant disconnect. At the LB layer we need **sticky sessions** so reconnects hit the same Node instance — standard Nginx `ip_hash` config.

---

## 7. Request Lifecycle (single round trip)

```
  HTTP request
      │
      ▼
  [ helmet ]                — security headers
      │
      ▼
  [ cors ]                  — origin allowlist
      │
      ▼
  [ rate limiter ]          — per-IP + per-user buckets
      │
      ▼
  [ body parser ]           — JSON, size-limited
      │
      ▼
  [ request logger ]        — winston, correlation ID attached
      │
      ▼
  [ auth middleware ]       — verifies JWT, loads user onto req
      │
      ▼
  [ role middleware ]       — checks req.user.role against route policy
      │
      ▼
  [ validator ]             — Joi schema for body/params/query
      │
      ▼
  [ controller ]            — thin: parse req → call service → shape response
      │
      ▼
  [ service layer ]         — business logic, transactions, other services
      │
      ▼
  [ model / mongoose ]      — data access only
      │
      ▼
  [ error handler ]         — catches thrown AppErrors, maps to HTTP codes
      │
      ▼
  HTTP response
```

---

## 8. Scalability Considerations

**What we do now (fits medium scale):**
1. **Stateless app process** — any request can hit any Node instance. Run 2–4 instances behind a load balancer from day one. PM2 in cluster mode on a single VPS works; k8s later.
2. **Mongo indexes on hot paths** — `users.email`, `products.sku`, `products.category+name` text index, `orders.clientId+createdAt`, `orders.status`, `deliveries.partnerId+status`. Indexes are defined in schema files, not created ad-hoc.
3. **Pagination everywhere** — no unbounded list endpoints. Cursor-based for orders (by `createdAt`), offset-based for products (easier filter UX).
4. **Atomic inventory decrements** — `findOneAndUpdate` with `$inc` guarded by `stock: { $gte: quantity }`. Prevents overselling without locks.
5. **Aggregation, not N+1** — admin dashboard uses a single aggregation pipeline, not a loop of finds.
6. **Image CDN-ready** — images served from a `/uploads` path we can point at a CDN later without code changes.

**What we leave room for (when you outgrow):**
- **Redis caching** — for hot product reads and session/refresh-token blacklists. *Would need your approval — not adding now.*
- **Queue worker** — for invoice generation, email, webhook retries. BullMQ on Redis. Not needed at 500 orders/day.
- **Read replicas** — Mongo replica set; direct analytic reads to secondaries.
- **CDN for images** — Cloudflare/CloudFront when bandwidth bites.

These are **hooks**, not promises. I'll keep the code shaped so they drop in later without rewrites.

---

## 9. Security Baseline

- **helmet** — sets CSP, HSTS, X-Frame-Options, etc.
- **cors** — strict origin allowlist from env
- **express-rate-limit** — 100 req/min per IP for public routes, 1000 req/min per authenticated user. Stricter on `/auth/*` (10/min).
- **Joi validation** on every route — reject malformed input at the edge
- **Mongo injection protection** — `mongo-sanitize` strips `$` and `.` from inputs
- **JWT secrets** — loaded from env, rotated on a schedule, never committed
- **Passwords** — not used for OAuth users. Admin bootstrap user uses bcrypt (cost 12)
- **Razorpay webhook** — signature verified against shared secret, request body must be raw bytes
- **Audit log** — admin mutations (order cancel, refund, role change) written to an append-only `auditLogs` collection
- **Secrets in env** — `.env.example` committed, `.env` never. Schema validated at boot with Joi — app refuses to start with missing config.

---

## 10. Folder Structure Preview (full detail in Phase 6)

```
stationery-platform/
├── backend/
│   ├── src/
│   │   ├── config/              # env, db, passport, logger
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   ├── catalog/
│   │   │   ├── orders/
│   │   │   ├── delivery/
│   │   │   ├── payments/
│   │   │   ├── invoices/
│   │   │   └── feedback/
│   │   ├── middleware/          # auth, rbac, error, validate
│   │   ├── common/              # errors, utils, constants
│   │   ├── sockets/             # socket.io setup + handlers
│   │   ├── app.js               # express app factory
│   │   └── server.js            # http server + socket bootstrap
│   ├── tests/
│   └── package.json
└── frontend/
    ├── src/
    │   ├── pages/
    │   ├── components/
    │   ├── features/            # auth, catalog, cart, orders, delivery
    │   ├── hooks/
    │   ├── api/                 # axios client + endpoint wrappers
    │   ├── context/             # auth, cart, socket
    │   └── App.jsx
    └── package.json
```

---

## 11. Environment & Config Strategy

Every deploy target (dev, staging, prod) reads the same `.env` contract. Example:

```
NODE_ENV=production
PORT=4000
MONGODB_URI=mongodb+srv://...
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALLBACK_URL=https://api.example.com/auth/google/callback
RAZORPAY_KEY_ID=...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
CORS_ORIGINS=https://app.example.com
UPLOAD_DIR=./uploads
LOG_LEVEL=info
```

Config is loaded once at boot, validated against a Joi schema, frozen, and imported as a singleton. No `process.env.FOO` scattered through the codebase.

---

## 12. What's Decided vs Open

**Decided (locked in):**
- Modular monolith, Express + Node
- MongoDB only, no MySQL
- JWT (access) + refresh-token cookie
- Razorpay for payments
- Socket.io for real-time with sticky sessions
- PDFKit for invoices
- Local filesystem for uploads (swappable to S3)
- Winston for logging

**Open (need your call before I add):**
- **Redis** — I'm *not* adding it now. Rate limiting uses in-memory store (fine for 2–4 instances; becomes wrong at ~8+).
- **Email provider** — we'll design the `NotificationChannel` interface but leave email as TODO until you pick SMTP/SendGrid/etc.
- **Search** — Mongo text index is enough for thousands of products. We'd need Meili/Elastic only past ~100K SKUs.
- **CI/CD + deployment target** — deferred until you decide where this lives.

---

## Next Step

Phase 1 ends here. If the architecture above looks right, I'll move to **Phase 2: Database Schema Design** — full Mongoose schemas for every collection, with indexes, validators, and the reasoning behind each field. Say the word and I'll proceed.

If anything in this doc needs to change — scale assumptions, service split, a choice you want to make differently — tell me now so Phase 2 builds on the right foundation.
