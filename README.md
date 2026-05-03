# Stationery Platform — B2B Ordering System

Production-grade B2B stationery ordering platform built with React, Node/Express, MongoDB, and Razorpay.

## Features

- **Multi-role system** — Admin, Client, Delivery Partner (Google OAuth login)
- **Bulk ordering** — Tiered pricing, min/max order quantities, GST-compliant invoices
- **Razorpay payments** — Online payment + credit terms (Net-30/60) for trusted companies
- **Real-time tracking** — Socket.io for order status updates, delivery GPS tracking
- **Admin dashboard** — Order accept/reject, delivery assignment, revenue stats, low stock alerts
- **Indian GST compliance** — CGST/SGST (intra-state) vs IGST (inter-state), HSN codes, PDF invoices

## Tech Stack

| Layer      | Technology                          |
| ---------- | ----------------------------------- |
| Frontend   | React 18, Vite, React Router 6     |
| Backend    | Node.js 18+, Express 4             |
| Database   | MongoDB 7 (Mongoose 8)             |
| Auth       | Google OAuth 2.0, JWT + httpOnly cookies |
| Payments   | Razorpay                            |
| Real-time  | Socket.io                           |
| Invoices   | PDFKit                              |

## Project Structure

```
├── backend/
│   ├── src/
│   │   ├── config/          # env, database, logger, passport, razorpay
│   │   ├── common/          # AppError, asyncHandler, constants, helpers, models
│   │   ├── middleware/       # auth, validate, errorHandler, upload, correlationId
│   │   ├── modules/
│   │   │   ├── auth/        # user/company models, Google OAuth, JWT, profile
│   │   │   ├── catalog/     # product model, CRUD, search, image upload
│   │   │   ├── orders/      # cart, checkout (Mongo transactions), order lifecycle
│   │   │   ├── payments/    # Razorpay integration, webhook, refunds
│   │   │   ├── delivery/    # partner assignment, status tracking, GPS
│   │   │   ├── invoices/    # PDF generation, GST calculation
│   │   │   ├── feedback/    # reviews with incremental rating updates
│   │   │   └── admin/       # dashboard aggregations, order/user management
│   │   ├── sockets/         # Socket.io setup, room management
│   │   └── scripts/         # seed.js, jobs.js
│   ├── ecosystem.config.js  # PM2 config
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── api/             # axios client, API wrappers
│   │   ├── context/         # Auth, Socket, Cart providers
│   │   ├── hooks/           # useSocketEvent, useRazorpay
│   │   ├── components/      # layout, common
│   │   ├── pages/           # landing, auth, catalog, cart, orders, dashboard
│   │   └── styles/          # global.css
│   ├── nginx.conf
│   └── Dockerfile
├── docker-compose.yml
└── README.md
```

## Quick Start (Local Development)

### Prerequisites

- Node.js >= 18
- MongoDB 7 (local or Atlas)
- Google Cloud Console project with OAuth 2.0 credentials
- Razorpay test account

### 1. Clone and install

```bash
git clone <your-repo-url>
cd stationery-platform

# Backend
cd backend
cp .env.example .env    # fill in all values
npm install

# Frontend
cd ../frontend
npm install
```

### 2. Configure environment

Edit `backend/.env` with your credentials:
- MongoDB URI
- Google OAuth client ID/secret (callback: `http://localhost:4000/api/v1/auth/google/callback`)
- Razorpay test keys
- JWT secrets (32+ char random strings)
- `CLIENT_URL=http://localhost:3000`
- `CORS_ORIGINS=http://localhost:3000`

### 3. Seed the database

```bash
cd backend
npm run seed
```

This creates an admin user, 3 delivery partners, and 8 sample products.

### 4. Run

```bash
# Terminal 1 — Backend
cd backend && npm run dev

# Terminal 2 — Frontend
cd frontend && npm run dev
```

- Frontend: http://localhost:3000
- API: http://localhost:4000/api/v1
- Health: http://localhost:4000/health

## Docker Deployment

```bash
# Copy and configure env file
cp backend/.env.example backend/.env
# Edit backend/.env (set MONGODB_URI=mongodb://mongo:27017/stationery_platform)

# Build and start all services
docker compose up -d --build

# Seed the database
docker compose exec backend node src/scripts/jobs.js
docker compose exec backend node src/scripts/seed.js
```

Access the app at http://localhost (port 80).

## PM2 Deployment (VPS)

```bash
cd backend
npm install -g pm2

# Start with cluster mode
pm2 start ecosystem.config.js --env production

# Monitor
pm2 monit
pm2 logs stationery-api
```

The PM2 config also schedules maintenance jobs (cart cleanup, overdue credit alerts, low stock reports) to run daily at 2 AM.

## API Overview

All endpoints are prefixed with `/api/v1`.

| Group      | Endpoints                                                   |
| ---------- | ----------------------------------------------------------- |
| Auth       | Google OAuth, refresh token, profile, company CRUD          |
| Catalog    | List/search products, categories, admin CRUD, image upload  |
| Cart       | Add/update/remove items, get cart with live pricing         |
| Orders     | Checkout (Mongo transaction), cancel, list, get             |
| Payments   | Razorpay order creation, verification, webhook, refund      |
| Delivery   | Assign partner, update status, GPS location, tracking       |
| Invoices   | Get invoice, download PDF                                   |
| Feedback   | Submit review, get product reviews                          |
| Admin      | Dashboard stats, order accept/reject, user management       |

## Key Design Decisions

1. **Monetary values in paisa** — All amounts stored as integers (₹1 = 100 paisa) to avoid floating-point errors
2. **Atomic inventory** — `findOneAndUpdate` with `$gte` guard inside Mongo transactions prevents overselling
3. **Product snapshots** — Order items embed a copy of the product at purchase time (immutable legal record)
4. **JWT + httpOnly refresh** — Access token (15min, in-memory) + refresh token (7d, httpOnly cookie with bcrypt hash rotation)
5. **Modular monolith** — 8 service modules with clean boundaries, easily extractable to microservices later

## Maintenance Jobs

Run manually or via PM2 cron:

```bash
npm run jobs
```

- **cleanExpiredCarts** — Removes carts not updated in 7 days
- **creditPaymentAlerts** — Logs overdue credit payments past terms
- **lowStockReport** — Reports products with stock <= 10

## License

Private — All rights reserved.
