# Phase 3 — API Design
## B2B Stationery Ordering Platform — REST API Reference

**Base URL:** `https://api.example.com/api/v1`
**Auth:** Bearer JWT in `Authorization` header (except public routes)
**Content-Type:** `application/json` (except file uploads: `multipart/form-data`)
**Money:** All monetary values in **paisa** (integer). ₹50.00 = 5000.
**Pagination:** Cursor-based for orders/deliveries (`cursor` + `limit`), offset-based for products (`page` + `limit`).

---

## Table of Contents

1. [Global Conventions](#1-global-conventions)
2. [Auth APIs](#2-auth-apis)
3. [User / Profile APIs](#3-user--profile-apis)
4. [Company APIs](#4-company-apis)
5. [Product APIs (Catalog)](#5-product-apis-catalog)
6. [Cart APIs](#6-cart-apis)
7. [Order APIs](#7-order-apis)
8. [Payment APIs](#8-payment-apis)
9. [Delivery APIs](#9-delivery-apis)
10. [Invoice APIs](#10-invoice-apis)
11. [Feedback APIs](#11-feedback-apis)
12. [Admin APIs](#12-admin-apis)
13. [WebSocket Events](#13-websocket-events)
14. [Error Codes Reference](#14-error-codes-reference)

---

## 1. Global Conventions

### Response Envelope

Every response follows this structure:

```json
// Success
{
  "success": true,
  "data": { ... },
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 142,
    "hasMore": true
  }
}

// Error
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Quantity must be at least 1",
    "details": [
      { "field": "quantity", "message": "must be >= 1" }
    ]
  }
}
```

### HTTP Status Codes Used

| Code | When |
|---|---|
| 200 | Successful GET, PUT, PATCH |
| 201 | Successful POST (resource created) |
| 204 | Successful DELETE (no body) |
| 400 | Validation error, bad request |
| 401 | Missing or invalid JWT |
| 403 | Valid JWT but insufficient role |
| 404 | Resource not found |
| 409 | Conflict (duplicate, state violation) |
| 422 | Business logic rejection (insufficient stock, credit limit exceeded) |
| 429 | Rate limited |
| 500 | Internal server error |

### Auth Header

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

### Role Notation

Routes are annotated with required roles:
- `[public]` — no auth required
- `[auth]` — any authenticated user
- `[client]` — role = client
- `[admin]` — role = admin
- `[delivery]` — role = delivery
- `[admin, client]` — either role

---

## 2. Auth APIs

### 2.1 Initiate Google Login

```
GET /auth/google  [public]
```

Redirects browser to Google OAuth consent screen. Not called via AJAX — triggered by `<a href>` or `window.location`.

**Query params:**
| Param | Type | Description |
|---|---|---|
| `redirect` | string | Optional. Frontend URL to redirect after login. Default: `/` |

**Flow:**
1. Express redirects to Google with `client_id`, `scope=openid email profile`, `redirect_uri`
2. User approves
3. Google redirects to callback URL

---

### 2.2 Google OAuth Callback

```
GET /auth/google/callback  [public]
```

Handled by Passport. Not called directly by frontend.

**What happens server-side:**
1. Exchange `code` for tokens
2. Extract `googleId`, `email`, `name`, `avatar` from id_token
3. Upsert user: if `googleId` exists → update `lastLoginAt`; else → create user with `role: 'client'`
4. Generate JWT access token (15 min) + refresh token (7 days)
5. Set refresh token as `httpOnly` cookie
6. Redirect to frontend with access token in URL fragment: `https://app.example.com/auth/callback#token=eyJ...`

**Why URL fragment?** — fragments (`#`) are never sent to the server in subsequent requests. The React app reads it once, stores in memory, removes from URL.

---

### 2.3 Refresh Access Token

```
POST /auth/refresh  [public]
```

Uses the `httpOnly` refresh cookie (sent automatically by browser).

**Request:** No body needed. Cookie is sent automatically.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "expiresIn": 900
  }
}
```

**Response (401) — invalid/expired refresh token:**
```json
{
  "success": false,
  "error": {
    "code": "REFRESH_TOKEN_INVALID",
    "message": "Session expired. Please log in again."
  }
}
```

**Behavior:**
- Validates refresh token cookie against `user.refreshTokenHash`
- Rotates refresh token (new cookie, new hash in DB) — prevents replay
- If token is invalid, clears cookie and returns 401

---

### 2.4 Logout

```
POST /auth/logout  [auth]
```

**Request:** No body.

**Response (200):**
```json
{
  "success": true,
  "data": { "message": "Logged out successfully" }
}
```

**Behavior:**
- Sets `user.refreshTokenHash = null`
- Clears refresh cookie
- Access token remains valid until it expires (15 min max) — frontend discards it immediately

---

### 2.5 Get Current User

```
GET /auth/me  [auth]
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "_id": "664a1b2c3d4e5f6789012345",
      "email": "john@acmecorp.com",
      "name": "John Doe",
      "avatar": "https://lh3.googleusercontent.com/...",
      "phone": "+919876543210",
      "role": "client",
      "company": {
        "_id": "664a1b2c3d4e5f6789012346",
        "name": "Acme Corporation",
        "creditLimit": 5000000,
        "outstandingBalance": 120000,
        "paymentTermsDays": 30
      },
      "isActive": true,
      "lastLoginAt": "2026-05-03T10:30:00.000Z",
      "createdAt": "2026-01-15T08:00:00.000Z"
    }
  }
}
```

---

## 3. User / Profile APIs

### 3.1 Update Profile

```
PATCH /users/profile  [auth]
```

**Request:**
```json
{
  "name": "John D. Doe",
  "phone": "+919876543210"
}
```

**Validation:** Name max 100 chars. Phone must be valid Indian mobile (`+91XXXXXXXXXX`).

**Response (200):**
```json
{
  "success": true,
  "data": {
    "user": { ... }
  }
}
```

---

### 3.2 Setup Company (first-time client)

```
POST /users/company  [client]
```

Called when a new client needs to register their company. If company with same GSTIN exists, links user to it.

**Request:**
```json
{
  "name": "Acme Corporation",
  "gstin": "29ABCDE1234F1Z5",
  "pan": "ABCDE1234F",
  "billingAddress": {
    "line1": "123 MG Road",
    "line2": "4th Floor",
    "city": "Bangalore",
    "state": "Karnataka",
    "pincode": "560001"
  },
  "shippingAddresses": [
    {
      "line1": "456 Whitefield",
      "city": "Bangalore",
      "state": "Karnataka",
      "pincode": "560066"
    }
  ],
  "contactEmail": "orders@acmecorp.com",
  "contactPhone": "+918012345678"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "company": {
      "_id": "664a1b2c3d4e5f6789012346",
      "name": "Acme Corporation",
      "gstin": "29ABCDE1234F1Z5",
      "creditLimit": 0,
      "paymentTermsDays": 0,
      ...
    }
  }
}
```

---

## 4. Company APIs

### 4.1 Get Company Details

```
GET /companies/:companyId  [client, admin]
```

Clients can only see their own company. Admins can see any.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "company": {
      "_id": "664a1b2c3d4e5f6789012346",
      "name": "Acme Corporation",
      "gstin": "29ABCDE1234F1Z5",
      "billingAddress": { ... },
      "shippingAddresses": [ ... ],
      "creditLimit": 5000000,
      "outstandingBalance": 120000,
      "paymentTermsDays": 30,
      "isActive": true
    }
  }
}
```

### 4.2 Update Company

```
PATCH /companies/:companyId  [client, admin]
```

Client can update own company's non-financial fields. Admin can update everything including `creditLimit`, `paymentTermsDays`.

**Request (client):**
```json
{
  "contactPhone": "+918099887766",
  "shippingAddresses": [ ... ]
}
```

**Request (admin — can also set financial fields):**
```json
{
  "creditLimit": 10000000,
  "paymentTermsDays": 30
}
```

---

## 5. Product APIs (Catalog)

### 5.1 List Products

```
GET /products  [public]
```

**Query params:**
| Param | Type | Default | Description |
|---|---|---|---|
| `page` | number | 1 | Page number |
| `limit` | number | 20 | Items per page (max 100) |
| `category` | string | — | Filter by category |
| `subcategory` | string | — | Filter by subcategory |
| `brand` | string | — | Filter by brand |
| `search` | string | — | Text search (name, description, brand, tags) |
| `minPrice` | number | — | Minimum base price (paisa) |
| `maxPrice` | number | — | Maximum base price (paisa) |
| `inStock` | boolean | — | If true, only `stock > 0` |
| `sort` | string | `-createdAt` | Sort field. Options: `name`, `-name`, `basePrice`, `-basePrice`, `-createdAt`, `avgRating` |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "products": [
      {
        "_id": "664b...",
        "sku": "PEN-0001",
        "name": "Premium Blue Gel Pen",
        "slug": "premium-blue-gel-pen",
        "category": "Pens",
        "subcategory": "Gel Pens",
        "brand": "Cello",
        "basePrice": 5000,
        "priceTiers": [
          { "minQty": 1, "maxQty": 49, "pricePerUnit": 5000 },
          { "minQty": 50, "maxQty": 199, "pricePerUnit": 4500 },
          { "minQty": 200, "maxQty": null, "pricePerUnit": 4000 }
        ],
        "stock": 5000,
        "minOrderQty": 1,
        "unit": "piece",
        "thumbnail": "/uploads/products/PEN-0001-thumb.jpg",
        "avgRating": 4.3,
        "totalReviews": 28,
        "gstRate": 18
      }
    ]
  },
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 342,
    "totalPages": 18,
    "hasMore": true
  }
}
```

---

### 5.2 Get Product Details

```
GET /products/:slug  [public]
```

Uses slug (URL-friendly) instead of ID for SEO.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "product": {
      "_id": "664b...",
      "sku": "PEN-0001",
      "name": "Premium Blue Gel Pen",
      "slug": "premium-blue-gel-pen",
      "description": "High-quality gel pen with smooth ink flow...",
      "category": "Pens",
      "subcategory": "Gel Pens",
      "brand": "Cello",
      "basePrice": 5000,
      "priceTiers": [ ... ],
      "gstRate": 18,
      "hsnCode": "96081000",
      "stock": 5000,
      "lowStockThreshold": 50,
      "minOrderQty": 1,
      "maxOrderQty": 10000,
      "unit": "piece",
      "images": [
        "/uploads/products/PEN-0001-1.jpg",
        "/uploads/products/PEN-0001-2.jpg"
      ],
      "thumbnail": "/uploads/products/PEN-0001-thumb.jpg",
      "attributes": {
        "color": "Blue",
        "inkType": "Gel",
        "tipSize": "0.7mm"
      },
      "avgRating": 4.3,
      "totalReviews": 28,
      "isActive": true,
      "createdAt": "2026-01-20T10:00:00.000Z"
    }
  }
}
```

---

### 5.3 Create Product

```
POST /products  [admin]
Content-Type: multipart/form-data
```

**Form fields:**
```
name: "Premium Blue Gel Pen"
description: "High-quality gel pen..."
category: "Pens"
subcategory: "Gel Pens"
brand: "Cello"
basePrice: 5000
priceTiers: [{"minQty":1,"maxQty":49,"pricePerUnit":5000},{"minQty":50,"maxQty":null,"pricePerUnit":4500}]
gstRate: 18
hsnCode: "96081000"
stock: 5000
minOrderQty: 1
maxOrderQty: 10000
unit: "piece"
attributes: {"color":"Blue","inkType":"Gel","tipSize":"0.7mm"}
images: [file1.jpg, file2.jpg]  // multipart file upload
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "product": {
      "_id": "664b...",
      "sku": "PEN-0001",
      ...
    }
  }
}
```

**Notes:**
- `sku` is auto-generated from category prefix + sequential number
- `slug` is auto-generated from name (with dedup: `premium-blue-gel-pen`, `premium-blue-gel-pen-2`)
- Images resized to max 1200px width via sharp (or kept as-is if we skip image processing)

---

### 5.4 Update Product

```
PATCH /products/:productId  [admin]
```

Partial update. Only send fields to change.

**Request:**
```json
{
  "basePrice": 5500,
  "stock": 3000,
  "priceTiers": [
    { "minQty": 1, "maxQty": 99, "pricePerUnit": 5500 },
    { "minQty": 100, "maxQty": null, "pricePerUnit": 4800 }
  ]
}
```

**Response (200):** Updated product object.

---

### 5.5 Delete Product (Soft)

```
DELETE /products/:productId  [admin]
```

Sets `isDeleted: true`. Product disappears from catalog but stays in order history.

**Response (200):**
```json
{
  "success": true,
  "data": { "message": "Product archived successfully" }
}
```

---

### 5.6 Upload Product Images

```
POST /products/:productId/images  [admin]
Content-Type: multipart/form-data
```

**Form fields:**
```
images: [file1.jpg, file2.jpg]  // max 8 total per product
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "images": [
      "/uploads/products/PEN-0001-1.jpg",
      "/uploads/products/PEN-0001-2.jpg",
      "/uploads/products/PEN-0001-3.jpg"
    ]
  }
}
```

---

## 6. Cart APIs

### 6.1 Get Cart

```
GET /cart  [client]
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "cart": {
      "_id": "664c...",
      "items": [
        {
          "_id": "664c1...",
          "product": {
            "_id": "664b...",
            "name": "Premium Blue Gel Pen",
            "sku": "PEN-0001",
            "thumbnail": "/uploads/products/PEN-0001-thumb.jpg",
            "basePrice": 5000,
            "priceTiers": [ ... ],
            "stock": 5000,
            "minOrderQty": 1,
            "unit": "piece",
            "isActive": true
          },
          "quantity": 200,
          "pricePerUnit": 4000
        }
      ],
      "summary": {
        "itemCount": 1,
        "subtotal": 800000,
        "estimatedGst": 144000,
        "estimatedTotal": 944000
      }
    }
  }
}
```

**Notes:** `summary` is computed server-side from live product prices, not stored. If a product's price changed since it was added, the cart reflects the new price.

---

### 6.2 Add Item to Cart

```
POST /cart/items  [client]
```

**Request:**
```json
{
  "productId": "664b...",
  "quantity": 200
}
```

**Validation:**
- Product must exist and be active
- Quantity >= product.minOrderQty
- Quantity <= product.maxOrderQty
- If item already in cart, quantity is **replaced** (not added). Use PATCH to adjust.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "cart": { ... }
  }
}
```

**Error (422) — insufficient stock:**
```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Only 150 units available for PEN-0001",
    "details": { "available": 150, "requested": 200 }
  }
}
```

---

### 6.3 Update Cart Item Quantity

```
PATCH /cart/items/:itemId  [client]
```

**Request:**
```json
{
  "quantity": 300
}
```

**Response (200):** Updated cart.

---

### 6.4 Remove Item from Cart

```
DELETE /cart/items/:itemId  [client]
```

**Response (200):** Updated cart (without the removed item).

---

### 6.5 Clear Cart

```
DELETE /cart  [client]
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "cart": { "items": [], "summary": { "itemCount": 0, "subtotal": 0 } }
  }
}
```

---

## 7. Order APIs

### 7.1 Place Order (Checkout)

```
POST /orders  [client]
```

This is the most critical endpoint. It must be atomic.

**Request:**
```json
{
  "shippingAddressIndex": 0,
  "paymentMethod": "razorpay",
  "notes": "Please deliver before 10 AM on weekdays"
}
```

| Field | Description |
|---|---|
| `shippingAddressIndex` | Index into `company.shippingAddresses[]`. Or pass a full address object in `shippingAddress`. |
| `paymentMethod` | `"razorpay"` or `"credit"` (if company has credit terms) |
| `notes` | Optional order notes |

**What happens server-side (in a Mongo transaction):**
1. Load cart with populated products
2. Validate every item: product active, stock available, price tier resolved
3. Compute per-item subtotal, GST, total
4. Compute order-level totals
5. If `paymentMethod === 'credit'`: check `company.outstandingBalance + grandTotal <= company.creditLimit`
6. Generate `orderNumber` via Counter
7. Create Order document (status: `pending_payment` for razorpay, `confirmed` for credit)
8. Decrement inventory: `Product.findOneAndUpdate({ _id, stock: { $gte: qty } }, { $inc: { stock: -qty } })`
9. If razorpay: create Razorpay order via API, create Payment doc
10. If credit: increment `company.outstandingBalance`
11. Clear cart
12. Commit transaction
13. Emit `order.new` socket event to admin room

**Response (201) — Razorpay payment:**
```json
{
  "success": true,
  "data": {
    "order": {
      "_id": "664d...",
      "orderNumber": "ORD-2026-00042",
      "status": "pending_payment",
      "items": [ ... ],
      "grandTotal": 944000,
      "createdAt": "2026-05-03T12:00:00.000Z"
    },
    "payment": {
      "razorpayOrderId": "order_LkjH8sK2pQ1mN4",
      "amount": 944000,
      "currency": "INR",
      "keyId": "rzp_live_xxxxxxxxxxxx"
    }
  }
}
```

Frontend uses `razorpayOrderId` + `keyId` to open Razorpay checkout modal.

**Response (201) — Credit payment:**
```json
{
  "success": true,
  "data": {
    "order": {
      "_id": "664d...",
      "orderNumber": "ORD-2026-00042",
      "status": "confirmed",
      "paymentMethod": "credit",
      "grandTotal": 944000
    }
  }
}
```

**Error (422) — credit limit exceeded:**
```json
{
  "success": false,
  "error": {
    "code": "CREDIT_LIMIT_EXCEEDED",
    "message": "Order total (₹9,440.00) plus outstanding balance (₹1,200.00) exceeds credit limit (₹10,000.00)",
    "details": {
      "orderTotal": 944000,
      "outstanding": 120000,
      "creditLimit": 1000000
    }
  }
}
```

---

### 7.2 Verify Razorpay Payment (client-side callback)

```
POST /orders/:orderId/verify-payment  [client]
```

Called after Razorpay checkout modal returns success on the client side.

**Request:**
```json
{
  "razorpayPaymentId": "pay_LkjH8sK2pQ1mN4",
  "razorpayOrderId": "order_LkjH8sK2pQ1mN4",
  "razorpaySignature": "e8b3c..."
}
```

**What happens:**
1. Verify signature: `HMAC-SHA256(razorpayOrderId + "|" + razorpayPaymentId, webhook_secret) === razorpaySignature`
2. If valid: update Payment status → `captured`, Order status → `confirmed`
3. Generate invoice
4. Emit `order.updated` socket event

**Response (200):**
```json
{
  "success": true,
  "data": {
    "order": {
      "_id": "664d...",
      "orderNumber": "ORD-2026-00042",
      "status": "confirmed"
    }
  }
}
```

**Response (400) — signature mismatch:**
```json
{
  "success": false,
  "error": {
    "code": "PAYMENT_VERIFICATION_FAILED",
    "message": "Payment signature verification failed. Do not fulfill this order."
  }
}
```

---

### 7.3 List My Orders (Client)

```
GET /orders  [client]
```

**Query params:**
| Param | Type | Default | Description |
|---|---|---|---|
| `status` | string | — | Filter by status |
| `cursor` | string | — | Cursor for pagination (ISO date of last item) |
| `limit` | number | 20 | Items per page (max 50) |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "orders": [
      {
        "_id": "664d...",
        "orderNumber": "ORD-2026-00042",
        "status": "confirmed",
        "items": [
          {
            "productSnapshot": { "name": "Premium Blue Gel Pen", "sku": "PEN-0001" },
            "quantity": 200,
            "total": 944000
          }
        ],
        "grandTotal": 944000,
        "paymentMethod": "razorpay",
        "createdAt": "2026-05-03T12:00:00.000Z"
      }
    ]
  },
  "meta": {
    "limit": 20,
    "nextCursor": "2026-05-02T09:15:00.000Z",
    "hasMore": true
  }
}
```

---

### 7.4 Get Order Details

```
GET /orders/:orderId  [client, admin, delivery]
```

Client sees own orders. Delivery sees assigned orders. Admin sees all.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "order": {
      "_id": "664d...",
      "orderNumber": "ORD-2026-00042",
      "client": { "_id": "...", "name": "John Doe", "email": "john@acme.com" },
      "company": { "_id": "...", "name": "Acme Corporation" },
      "items": [
        {
          "product": "664b...",
          "productSnapshot": {
            "sku": "PEN-0001",
            "name": "Premium Blue Gel Pen",
            "category": "Pens",
            "unit": "piece",
            "gstRate": 18,
            "hsnCode": "96081000"
          },
          "quantity": 200,
          "pricePerUnit": 4000,
          "subtotal": 800000,
          "gstAmount": 144000,
          "total": 944000
        }
      ],
      "subtotal": 800000,
      "totalGst": 144000,
      "grandTotal": 944000,
      "shippingAddress": { ... },
      "status": "confirmed",
      "statusHistory": [
        { "status": "pending_payment", "changedBy": "664a...", "timestamp": "2026-05-03T12:00:00Z" },
        { "status": "confirmed", "changedBy": "664a...", "timestamp": "2026-05-03T12:01:30Z" }
      ],
      "paymentMethod": "razorpay",
      "delivery": null,
      "invoice": "664e...",
      "createdAt": "2026-05-03T12:00:00.000Z"
    }
  }
}
```

---

### 7.5 Cancel Order (Client)

```
POST /orders/:orderId/cancel  [client]
```

Only allowed if status is `pending_payment` or `confirmed`.

**Request:**
```json
{
  "reason": "Found a better price elsewhere"
}
```

**What happens:**
1. Validate status allows cancellation
2. Restore inventory (atomic `$inc: { stock: +qty }` per item)
3. If paid via Razorpay: initiate refund via Razorpay API
4. If paid via credit: decrement `company.outstandingBalance`
5. Set order status → `cancelled`
6. Append to `statusHistory`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "order": { "status": "cancelled", ... }
  }
}
```

---

## 8. Payment APIs

### 8.1 Razorpay Webhook

```
POST /payments/webhook  [public — signature-verified]
```

Called by Razorpay servers. **Not called by our frontend.**

**Headers:**
```
X-Razorpay-Signature: <HMAC-SHA256 of request body>
```

**Request body (raw):** Razorpay event payload.

**Events handled:**

| Event | Action |
|---|---|
| `payment.captured` | Update Payment → `captured`, Order → `confirmed`, generate invoice |
| `payment.failed` | Update Payment → `failed`, log failure reason |
| `refund.processed` | Update refund status in Payment doc |
| `refund.failed` | Update refund status, alert admin |

**Idempotency:** Webhook handler checks if event was already processed (by looking at `webhookEvents` array). Duplicate events are acknowledged (200) but not re-processed.

**Response:** Always 200 (Razorpay retries on non-2xx).

---

### 8.2 Get Payment for Order

```
GET /orders/:orderId/payment  [client, admin]
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "payment": {
      "_id": "664f...",
      "razorpayOrderId": "order_LkjH8sK2pQ1mN4",
      "razorpayPaymentId": "pay_LkjH8sK2pQ1mN4",
      "amount": 944000,
      "currency": "INR",
      "status": "captured",
      "method": "upi",
      "createdAt": "2026-05-03T12:00:00.000Z"
    }
  }
}
```

---

### 8.3 Initiate Refund

```
POST /orders/:orderId/refund  [admin]
```

**Request:**
```json
{
  "amount": 944000,
  "reason": "Order cancelled by customer"
}
```

Partial refunds supported: `amount` can be less than `grandTotal`.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "refund": {
      "razorpayRefundId": "rfnd_LkjH8sK2pQ1mN4",
      "amount": 944000,
      "status": "pending"
    }
  }
}
```

---

## 9. Delivery APIs

### 9.1 Assign Delivery Partner

```
POST /orders/:orderId/assign-delivery  [admin]
```

**Request:**
```json
{
  "partnerId": "664a...",
  "estimatedDeliveryAt": "2026-05-05T17:00:00.000Z"
}
```

**What happens:**
1. Validate partner exists, role = delivery, isAvailable, activeDeliveries < maxConcurrent
2. Create Delivery document
3. Link to Order (`order.delivery = deliveryId`)
4. Update order status → `processing`
5. Increment `partner.deliveryProfile.activeDeliveries`
6. Emit socket events to partner and client

**Response (201):**
```json
{
  "success": true,
  "data": {
    "delivery": {
      "_id": "664g...",
      "order": "664d...",
      "partner": { "_id": "664a...", "name": "Raj Kumar" },
      "status": "assigned",
      "estimatedDeliveryAt": "2026-05-05T17:00:00.000Z"
    }
  }
}
```

---

### 9.2 Get Available Delivery Partners

```
GET /delivery/partners/available  [admin]
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "partners": [
      {
        "_id": "664a...",
        "name": "Raj Kumar",
        "phone": "+919876543210",
        "deliveryProfile": {
          "vehicleType": "van",
          "isAvailable": true,
          "activeDeliveries": 2,
          "maxConcurrentDeliveries": 5
        }
      }
    ]
  }
}
```

---

### 9.3 Update Delivery Status (Partner)

```
PATCH /deliveries/:deliveryId/status  [delivery]
```

**Request:**
```json
{
  "status": "picked_up",
  "note": "Picked up from warehouse at 2 PM",
  "location": {
    "coordinates": [77.5946, 12.9716]
  }
}
```

**Allowed transitions:**
```
assigned → picked_up → in_transit → out_for_delivery → delivered
                                                      → failed_attempt → out_for_delivery (retry)
                    → returned (at any point after pickup)
```

**On `delivered`:**
1. Set `actualDeliveryAt`
2. Update order status → `delivered`
3. Decrement partner's `activeDeliveries`
4. Emit socket events

**Response (200):**
```json
{
  "success": true,
  "data": {
    "delivery": { "status": "picked_up", ... }
  }
}
```

---

### 9.4 Update Live Location (Partner)

```
POST /deliveries/:deliveryId/location  [delivery]
```

Called every ~30 seconds by the delivery partner's browser.

**Request:**
```json
{
  "coordinates": [77.5946, 12.9716]
}
```

**What happens:**
1. Update `delivery.currentLocation`
2. Append to `trackingEvents` (throttled — only store every 5th update to save space)
3. Broadcast via Socket.io to `order:{orderId}` room

**Response (200):**
```json
{ "success": true }
```

---

### 9.5 Get Delivery Tracking (Client)

```
GET /deliveries/:deliveryId/tracking  [client, admin]
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "delivery": {
      "_id": "664g...",
      "status": "in_transit",
      "partner": { "name": "Raj Kumar", "phone": "+919876543210" },
      "currentLocation": {
        "type": "Point",
        "coordinates": [77.5946, 12.9716]
      },
      "lastLocationUpdate": "2026-05-04T14:30:00.000Z",
      "trackingEvents": [
        { "status": "assigned", "timestamp": "2026-05-04T10:00:00Z" },
        { "status": "picked_up", "note": "Picked up from warehouse", "timestamp": "2026-05-04T11:00:00Z" },
        { "status": "in_transit", "timestamp": "2026-05-04T12:00:00Z" }
      ],
      "estimatedDeliveryAt": "2026-05-05T17:00:00.000Z"
    }
  }
}
```

---

### 9.6 My Deliveries (Partner Dashboard)

```
GET /deliveries/my  [delivery]
```

**Query params:**
| Param | Type | Default |
|---|---|---|
| `status` | string | — |
| `limit` | number | 20 |
| `cursor` | string | — |

Returns deliveries assigned to the logged-in partner, newest first.

---

### 9.7 Submit Delivery Proof

```
POST /deliveries/:deliveryId/proof  [delivery]
Content-Type: multipart/form-data
```

**Form fields:**
```
receiverName: "Priya Sharma"
receiverPhone: "+919876543210"
photo: [file.jpg]
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "delivery": {
      "deliveryProof": {
        "receiverName": "Priya Sharma",
        "receiverPhone": "+919876543210",
        "photoUrl": "/uploads/deliveries/664g-proof.jpg"
      }
    }
  }
}
```

---

## 10. Invoice APIs

### 10.1 Get Invoice for Order

```
GET /orders/:orderId/invoice  [client, admin]
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "invoice": {
      "_id": "664e...",
      "invoiceNumber": "INV-2025-26-00042",
      "order": "664d...",
      "seller": { "name": "StationeryHub Pvt Ltd", "gstin": "29XXXXX...", "address": "..." },
      "buyer": { "name": "John Doe", "companyName": "Acme Corporation", "gstin": "29ABCDE..." },
      "lineItems": [ ... ],
      "subtotal": 800000,
      "totalCgst": 72000,
      "totalSgst": 72000,
      "totalIgst": 0,
      "grandTotal": 944000,
      "amountInWords": "Nine Thousand Four Hundred Forty Rupees Only",
      "paymentMethod": "razorpay",
      "paymentStatus": "paid",
      "pdfPath": "/uploads/invoices/INV-2025-26-00042.pdf",
      "financialYear": "2025-26",
      "issuedAt": "2026-05-03T12:01:30.000Z"
    }
  }
}
```

---

### 10.2 Download Invoice PDF

```
GET /orders/:orderId/invoice/download  [client, admin]
```

Returns the PDF file directly with `Content-Type: application/pdf` and `Content-Disposition: attachment`.

---

## 11. Feedback APIs

### 11.1 Submit Review

```
POST /orders/:orderId/feedback  [client]
```

Only allowed if order status is `delivered`.

**Request:**
```json
{
  "productId": "664b...",
  "rating": 5,
  "title": "Excellent pens for office use",
  "comment": "Smooth ink flow, great for bulk orders. Will order again."
}
```

**Validation:**
- Order must be `delivered`
- Product must be in the order's items
- No existing review for this product+order combo

**Response (201):**
```json
{
  "success": true,
  "data": {
    "feedback": {
      "_id": "664h...",
      "product": "664b...",
      "rating": 5,
      "title": "Excellent pens for office use",
      "comment": "Smooth ink flow...",
      "createdAt": "2026-05-06T10:00:00.000Z"
    }
  }
}
```

**Side effect:** Updates `product.avgRating` and `product.totalReviews` atomically.

---

### 11.2 Get Reviews for Product

```
GET /products/:productId/reviews  [public]
```

**Query params:**
| Param | Type | Default |
|---|---|---|
| `page` | number | 1 |
| `limit` | number | 10 |
| `sort` | string | `-createdAt` |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "reviews": [
      {
        "_id": "664h...",
        "user": { "name": "John D." },
        "company": { "name": "Acme Corporation" },
        "rating": 5,
        "title": "Excellent pens for office use",
        "comment": "Smooth ink flow...",
        "adminResponse": null,
        "createdAt": "2026-05-06T10:00:00.000Z"
      }
    ],
    "summary": {
      "avgRating": 4.3,
      "totalReviews": 28,
      "distribution": {
        "5": 15,
        "4": 7,
        "3": 3,
        "2": 2,
        "1": 1
      }
    }
  },
  "meta": { "page": 1, "limit": 10, "total": 28 }
}
```

---

### 11.3 Admin: Respond to Review

```
PATCH /feedback/:feedbackId/respond  [admin]
```

**Request:**
```json
{
  "adminResponse": "Thank you for your feedback! We're glad you're happy with the quality."
}
```

---

## 12. Admin APIs

### 12.1 Dashboard Stats

```
GET /admin/dashboard  [admin]
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "stats": {
      "orders": {
        "today": 42,
        "pending": 8,
        "processing": 15,
        "shipped": 12,
        "delivered": 7
      },
      "revenue": {
        "today": 4250000,
        "thisMonth": 89500000,
        "thisYear": 1250000000
      },
      "inventory": {
        "totalProducts": 342,
        "lowStockProducts": 12,
        "outOfStockProducts": 3
      },
      "users": {
        "totalClients": 156,
        "totalCompanies": 89,
        "activeDeliveryPartners": 8
      }
    }
  }
}
```

---

### 12.2 List All Orders (Admin)

```
GET /admin/orders  [admin]
```

**Query params:**
| Param | Type | Description |
|---|---|---|
| `status` | string | Filter by status |
| `companyId` | string | Filter by company |
| `clientId` | string | Filter by client |
| `dateFrom` | ISO date | Filter from date |
| `dateTo` | ISO date | Filter to date |
| `sort` | string | Default: `-createdAt` |
| `cursor` | string | Pagination cursor |
| `limit` | number | Default: 20 |

---

### 12.3 Accept / Reject Order

```
POST /admin/orders/:orderId/accept  [admin]
```

**Request:**
```json
{
  "note": "Order confirmed. Processing will begin immediately."
}
```

Moves order from `confirmed` → `processing`.

```
POST /admin/orders/:orderId/reject  [admin]
```

**Request:**
```json
{
  "reason": "Items out of stock. Will notify when available."
}
```

Moves order to `rejected`. Restores inventory. Initiates refund if paid.

---

### 12.4 Manage Users

```
GET /admin/users  [admin]
```

**Query params:** `role`, `isActive`, `search` (name/email), `page`, `limit`

```
PATCH /admin/users/:userId/role  [admin]
```

**Request:**
```json
{
  "role": "delivery"
}
```

Logs to audit trail.

```
PATCH /admin/users/:userId/status  [admin]
```

**Request:**
```json
{
  "isActive": false
}
```

Deactivate/reactivate users. Deactivated users can't log in.

---

### 12.5 Low Stock Products

```
GET /admin/inventory/low-stock  [admin]
```

Returns products where `stock <= lowStockThreshold`.

---

### 12.6 Audit Log

```
GET /admin/audit-logs  [admin]
```

**Query params:** `action`, `actorId`, `resourceType`, `resourceId`, `dateFrom`, `dateTo`, `page`, `limit`

---

## 13. WebSocket Events

### Connection

```javascript
// Client-side
import { io } from 'socket.io-client';

const socket = io('https://api.example.com', {
  auth: { token: accessToken },
  transports: ['websocket'],
});
```

Server validates JWT on handshake. Invalid → disconnect.

### Events Emitted (Server → Client)

| Event | Room | Payload | When |
|---|---|---|---|
| `order:updated` | `user:{clientId}` | `{ orderId, status, orderNumber }` | Any order status change |
| `order:new` | `admin` | `{ orderId, orderNumber, company, grandTotal }` | New order placed |
| `order:needsAction` | `admin` | `{ orderId, action: 'assign_delivery' }` | Order confirmed, needs partner |
| `delivery:status` | `order:{orderId}` | `{ deliveryId, status, note }` | Delivery status change |
| `delivery:location` | `order:{orderId}` | `{ deliveryId, coordinates, timestamp }` | Live location update |
| `delivery:assigned` | `user:{partnerId}` | `{ deliveryId, orderId, pickupAddress }` | New delivery assigned |
| `payment:updated` | `user:{clientId}` | `{ orderId, paymentStatus }` | Payment captured/failed |

### Events Listened (Client → Server)

| Event | Auth | Payload | Purpose |
|---|---|---|---|
| `delivery:updateLocation` | delivery | `{ deliveryId, coordinates }` | Partner sends live location |
| `join:order` | auth | `{ orderId }` | Client joins order tracking room |
| `leave:order` | auth | `{ orderId }` | Client leaves tracking room |

---

## 14. Error Codes Reference

| Code | HTTP | Description |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Request body/params failed Joi validation |
| `UNAUTHORIZED` | 401 | Missing or invalid access token |
| `REFRESH_TOKEN_INVALID` | 401 | Refresh token expired or revoked |
| `FORBIDDEN` | 403 | Valid token but insufficient role |
| `NOT_FOUND` | 404 | Resource doesn't exist |
| `DUPLICATE_RESOURCE` | 409 | Unique constraint violation (e.g., duplicate review) |
| `ORDER_STATE_INVALID` | 409 | Action not allowed in current order status |
| `INSUFFICIENT_STOCK` | 422 | Not enough inventory for requested quantity |
| `CREDIT_LIMIT_EXCEEDED` | 422 | Order + outstanding > company credit limit |
| `PAYMENT_VERIFICATION_FAILED` | 400 | Razorpay signature mismatch |
| `COMPANY_REQUIRED` | 422 | Client must set up company before ordering |
| `CART_EMPTY` | 422 | Checkout attempted with empty cart |
| `PRODUCT_INACTIVE` | 422 | Product in cart was deactivated |
| `DELIVERY_PARTNER_UNAVAILABLE` | 422 | Partner at max concurrent deliveries |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## Route Summary Table

| Method | Route | Role | Purpose |
|---|---|---|---|
| GET | `/auth/google` | public | Start Google OAuth |
| GET | `/auth/google/callback` | public | OAuth callback |
| POST | `/auth/refresh` | public | Refresh access token |
| POST | `/auth/logout` | auth | Logout |
| GET | `/auth/me` | auth | Current user + company |
| PATCH | `/users/profile` | auth | Update name/phone |
| POST | `/users/company` | client | Register company |
| GET | `/companies/:id` | client/admin | Company details |
| PATCH | `/companies/:id` | client/admin | Update company |
| GET | `/products` | public | List/search products |
| GET | `/products/:slug` | public | Product details |
| POST | `/products` | admin | Create product |
| PATCH | `/products/:id` | admin | Update product |
| DELETE | `/products/:id` | admin | Soft delete product |
| POST | `/products/:id/images` | admin | Upload images |
| GET | `/cart` | client | Get cart |
| POST | `/cart/items` | client | Add to cart |
| PATCH | `/cart/items/:id` | client | Update quantity |
| DELETE | `/cart/items/:id` | client | Remove from cart |
| DELETE | `/cart` | client | Clear cart |
| POST | `/orders` | client | Place order (checkout) |
| POST | `/orders/:id/verify-payment` | client | Verify Razorpay payment |
| GET | `/orders` | client | My orders |
| GET | `/orders/:id` | auth | Order details |
| POST | `/orders/:id/cancel` | client | Cancel order |
| GET | `/orders/:id/payment` | client/admin | Payment details |
| POST | `/orders/:id/refund` | admin | Initiate refund |
| POST | `/orders/:id/assign-delivery` | admin | Assign delivery partner |
| GET | `/orders/:id/invoice` | client/admin | Invoice details |
| GET | `/orders/:id/invoice/download` | client/admin | Download invoice PDF |
| POST | `/orders/:id/feedback` | client | Submit review |
| GET | `/products/:id/reviews` | public | Product reviews |
| PATCH | `/feedback/:id/respond` | admin | Reply to review |
| POST | `/payments/webhook` | public* | Razorpay webhook |
| GET | `/delivery/partners/available` | admin | Available partners |
| PATCH | `/deliveries/:id/status` | delivery | Update delivery status |
| POST | `/deliveries/:id/location` | delivery | Update live location |
| GET | `/deliveries/:id/tracking` | client/admin | Track delivery |
| GET | `/deliveries/my` | delivery | My deliveries |
| POST | `/deliveries/:id/proof` | delivery | Submit delivery proof |
| GET | `/admin/dashboard` | admin | Dashboard stats |
| GET | `/admin/orders` | admin | All orders |
| POST | `/admin/orders/:id/accept` | admin | Accept order |
| POST | `/admin/orders/:id/reject` | admin | Reject order |
| GET | `/admin/users` | admin | List users |
| PATCH | `/admin/users/:id/role` | admin | Change user role |
| PATCH | `/admin/users/:id/status` | admin | Activate/deactivate |
| GET | `/admin/inventory/low-stock` | admin | Low stock alerts |
| GET | `/admin/audit-logs` | admin | Audit trail |

---

## Next Step

Phase 3 is complete — 45 endpoints fully specified with payloads, responses, error codes, and business logic notes.

**Ready for Phase 4:** Backend Implementation — production folder structure, Express app setup, all middleware, and module-by-module code. Say the word.
