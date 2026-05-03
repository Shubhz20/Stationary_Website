# Deployment Guide — StationeryHub

Split deployment: **Vercel** (frontend) + **Render** (backend) + **MongoDB Atlas** (database).

Vercel is perfect for the React frontend but can't run the backend — our backend needs persistent WebSocket connections (Socket.io), file uploads to disk, and long-running processes. Render's free tier handles all of this.

---

## Prerequisites

Before starting, make sure you have:

- A **GitHub account** with the project pushed to a repository
- A **MongoDB Atlas** cluster (you already have this)
- A **Google Cloud Console** project with OAuth 2.0 credentials
- A **Razorpay** account (test or live keys)
- A **domain name** (you already have this)

---

## Step 1: Prepare Your GitHub Repository

Push the entire project to GitHub if you haven't already:

```bash
cd "Stationary freelance"
git init
git add .
git commit -m "Initial commit — full platform"
git remote add origin https://github.com/YOUR_USERNAME/stationery-platform.git
git branch -M main
git push -u origin main
```

Make sure your `.gitignore` excludes `node_modules/`, `.env`, and `uploads/` contents.

---

## Step 2: Configure MongoDB Atlas

Since you already have Atlas, just make sure:

1. Go to **Atlas Dashboard** → your cluster → **Network Access**
2. Add `0.0.0.0/0` to the IP whitelist (allows connections from Render's dynamic IPs)
3. Go to **Database Access** → create a user with read/write permissions if you haven't
4. Get your connection string: **Connect** → **Connect your application** → copy the URI

Your URI will look like:
```
mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/stationery_platform?retryWrites=true&w=majority
```

---

## Step 3: Deploy Backend on Render

### 3.1 Create Render Account

Go to [render.com](https://render.com) and sign up with GitHub.

### 3.2 Create a New Web Service

1. Click **New** → **Web Service**
2. Connect your GitHub repo
3. Configure the service:

| Setting | Value |
|---------|-------|
| **Name** | `stationery-api` |
| **Region** | Pick closest to your users (Singapore for India) |
| **Root Directory** | `backend` |
| **Runtime** | Node |
| **Build Command** | `npm install` |
| **Start Command** | `node src/server.js` |
| **Instance Type** | Free (or Starter $7/mo for always-on) |

### 3.3 Add Environment Variables

In the Render dashboard → your service → **Environment**, add every variable:

```
NODE_ENV=production
PORT=4000

MONGODB_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/stationery_platform?retryWrites=true&w=majority

JWT_ACCESS_SECRET=<generate-a-random-64-char-string>
JWT_REFRESH_SECRET=<generate-a-different-random-64-char-string>
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d

GOOGLE_CLIENT_ID=<your-google-client-id>
GOOGLE_CLIENT_SECRET=<your-google-client-secret>
GOOGLE_CALLBACK_URL=https://stationery-api.onrender.com/api/v1/auth/google/callback

CLIENT_URL=https://your-domain.com
CORS_ORIGINS=https://your-domain.com,https://stationery-platform.vercel.app

RAZORPAY_KEY_ID=<your-razorpay-key-id>
RAZORPAY_KEY_SECRET=<your-razorpay-key-secret>
RAZORPAY_WEBHOOK_SECRET=<your-razorpay-webhook-secret>

UPLOAD_DIR=./uploads
MAX_FILE_SIZE_MB=5
LOG_LEVEL=info

RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
```

To generate secure JWT secrets, run in your terminal:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 3.4 Create a Persistent Disk (for uploads)

On Render free tier, the filesystem resets on every deploy. For file uploads to persist:

1. Go to your service → **Disks**
2. Add a disk:
   - **Mount Path**: `/opt/render/project/src/uploads`
   - **Size**: 1 GB (increase as needed)

Update the `UPLOAD_DIR` environment variable:
```
UPLOAD_DIR=/opt/render/project/src/uploads
```

### 3.5 Deploy

Click **Manual Deploy** → **Deploy latest commit**. Watch the logs for the startup banner. Once you see "Socket.io: ready", the backend is live.

Your backend URL will be: `https://stationery-api.onrender.com`

Test it: visit `https://stationery-api.onrender.com/health` — you should see `{"status":"ok"}`.

### 3.6 Seed the Database

In Render dashboard → your service → **Shell**, run:
```bash
node src/scripts/seed.js
```

This creates the admin user, delivery partners, and sample products.

---

## Step 4: Deploy Frontend on Vercel

### 4.1 Create Vercel Account

Go to [vercel.com](https://vercel.com) and sign up with GitHub.

### 4.2 Import Your Project

1. Click **Add New** → **Project**
2. Import your GitHub repository
3. Configure:

| Setting | Value |
|---------|-------|
| **Framework Preset** | Vite |
| **Root Directory** | `frontend` |
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |

### 4.3 Add Environment Variable

Add one environment variable in Vercel:

```
VITE_API_URL=https://stationery-api.onrender.com
```

### 4.4 Configure API Rewrites

Create a file `frontend/vercel.json` to proxy API calls to the backend:

```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://stationery-api.onrender.com/api/:path*" },
    { "source": "/uploads/:path*", "destination": "https://stationery-api.onrender.com/uploads/:path*" }
  ]
}
```

**Important**: Push this file to GitHub so Vercel picks it up.

### 4.5 Deploy

Vercel auto-deploys on push. Your frontend URL will be: `https://stationery-platform.vercel.app`

---

## Step 5: Connect Your Custom Domain

### 5.1 Frontend Domain (Vercel)

1. Vercel Dashboard → your project → **Settings** → **Domains**
2. Add your domain (e.g., `stationeryhub.com`)
3. Follow Vercel's DNS instructions:
   - Add a **CNAME** record: `www` → `cname.vercel-dns.com`
   - Add an **A** record: `@` → `76.76.21.21`
4. Vercel auto-provisions SSL

### 5.2 Backend Subdomain (Render)

1. Render Dashboard → your service → **Settings** → **Custom Domains**
2. Add `api.stationeryhub.com`
3. Add a **CNAME** record at your DNS provider: `api` → `stationery-api.onrender.com`
4. Render auto-provisions SSL

### 5.3 Update Environment Variables

After domain setup, update these values:

**On Render (backend):**
```
GOOGLE_CALLBACK_URL=https://api.stationeryhub.com/api/v1/auth/google/callback
CLIENT_URL=https://stationeryhub.com
CORS_ORIGINS=https://stationeryhub.com,https://www.stationeryhub.com
```

**On Vercel (frontend):**
```
VITE_API_URL=https://api.stationeryhub.com
```

**Update `frontend/vercel.json`:**
```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://api.stationeryhub.com/api/:path*" },
    { "source": "/uploads/:path*", "destination": "https://api.stationeryhub.com/uploads/:path*" }
  ]
}
```

---

## Step 6: Configure Google OAuth for Production

1. Go to [Google Cloud Console](https://console.cloud.google.com) → your project
2. **APIs & Services** → **Credentials** → your OAuth 2.0 Client
3. Add **Authorized redirect URIs**:
   ```
   https://api.stationeryhub.com/api/v1/auth/google/callback
   ```
4. Add **Authorized JavaScript origins**:
   ```
   https://stationeryhub.com
   https://www.stationeryhub.com
   ```
5. If your app is still in "Testing" mode, go to **OAuth consent screen** → publish to production (otherwise only test users can log in)

---

## Step 7: Configure Razorpay Webhook

1. Go to [Razorpay Dashboard](https://dashboard.razorpay.com) → **Webhooks**
2. Add a new webhook:
   - **URL**: `https://api.stationeryhub.com/api/v1/payments/webhook`
   - **Secret**: Use the same value as `RAZORPAY_WEBHOOK_SECRET` in Render
   - **Events**: Select `payment.captured`, `payment.failed`, `refund.processed`

---

## Step 8: Handle Socket.io (Important)

Vercel rewrites work for REST API calls but **not for WebSocket connections**. Socket.io needs a direct connection to the backend.

Update the Socket.io connection in `frontend/src/context/SocketContext.jsx` to connect directly to the backend URL:

```javascript
// In SocketContext.jsx, change the connection URL:
const socket = io(import.meta.env.VITE_API_URL || '', {
  // ... existing options
});
```

Make sure `VITE_API_URL` is set on Vercel. In development (where the Vite proxy handles it), the env var won't be set, so it defaults to `''` (same origin) — which is correct.

---

## Post-Deploy Checklist

After everything is deployed, verify each piece:

- [ ] `https://api.stationeryhub.com/health` returns `{"status":"ok","mongo":"connected"}`
- [ ] `https://stationeryhub.com` loads the landing page
- [ ] Google sign-in works (redirects and comes back with token)
- [ ] Product catalog loads with seeded products
- [ ] Adding to cart works for a logged-in client
- [ ] Checkout flow works (Razorpay modal opens)
- [ ] Admin dashboard loads at `/admin` for admin user
- [ ] Real-time updates work (place an order, admin sees notification)

---

## Cost Summary

| Service | Free Tier | Paid Tier |
|---------|-----------|-----------|
| **Vercel** (frontend) | 100 GB bandwidth/mo | Pro: $20/mo |
| **Render** (backend) | 750 hrs/mo, spins down after 15 min idle | Starter: $7/mo (always-on) |
| **MongoDB Atlas** | M0 (512 MB, shared) | M10: ~$57/mo (dedicated) |
| **Total** | **$0/mo** to start | **$84/mo** for production |

**Note on Render free tier**: The backend spins down after 15 minutes of inactivity. First request after spin-down takes ~30 seconds to cold-start. Upgrade to the $7/mo Starter plan for always-on. This is the single biggest quality-of-life improvement for a production deployment.

---

## Scaling Tips (When You Grow)

1. **Render → Railway or DigitalOcean App Platform**: If you outgrow Render, Railway offers better scaling. For full control, use the Docker setup with DigitalOcean ($12/mo droplet).

2. **File uploads → Cloudinary or AWS S3**: Replace Multer disk storage with cloud storage so uploads survive across deployments without persistent disks.

3. **MongoDB Atlas → M10+**: Upgrade from M0 (shared) to M10 (dedicated) when you hit 500+ orders/day for consistent performance.

4. **Add Redis**: For Socket.io adapter (multi-instance sticky sessions), rate limiting store, and cart caching.

5. **CDN**: Vercel already uses a global CDN for the frontend. For uploaded images, add Cloudflare in front of your backend.
