# Phase 2 — Database Schema Design
## B2B Stationery Ordering Platform — MongoDB (Mongoose)

**Database:** MongoDB (single database: `stationery_platform`)
**ODM:** Mongoose 8.x
**Conventions:** camelCase fields, timestamps auto-managed, soft deletes where needed, all monetary values stored in **paisa** (integer, ₹1 = 100 paisa — avoids floating-point errors).

---

## Table of Contents

1. [User Schema](#1-user-schema)
2. [Company Schema](#2-company-schema)
3. [Product Schema](#3-product-schema)
4. [Cart Schema](#4-cart-schema)
5. [Order Schema](#5-order-schema)
6. [Payment Schema](#6-payment-schema)
7. [Invoice Schema](#7-invoice-schema)
8. [Delivery Schema](#8-delivery-schema)
9. [Feedback Schema](#9-feedback-schema)
10. [Audit Log Schema](#10-audit-log-schema)
11. [Counter Schema](#11-counter-schema)
12. [Index Strategy](#12-index-strategy)
13. [Relationship Map](#13-relationship-map)

---

## 1. User Schema

**Collection:** `users`
**Purpose:** All human actors — clients, admins, delivery partners. Single collection, role-differentiated.

```javascript
// src/modules/auth/user.model.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    // ── Identity ──
    googleId: {
      type: String,
      unique: true,
      sparse: true, // allows null for manually-created admin accounts
      index: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    avatar: {
      type: String, // Google profile picture URL
      default: null,
    },
    phone: {
      type: String,
      trim: true,
      default: null,
      // validated via Joi at the route level, not here
    },

    // ── Authorization ──
    role: {
      type: String,
      enum: ['client', 'admin', 'delivery'],
      default: 'client',
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    // ── Client-specific ──
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      default: null,
      // Populated only for clients. Admin/delivery don't belong to a company.
    },

    // ── Delivery-partner-specific ──
    deliveryProfile: {
      vehicleType: {
        type: String,
        enum: ['bike', 'van', 'truck', null],
        default: null,
      },
      isAvailable: {
        type: Boolean,
        default: true,
      },
      currentLocation: {
        type: {
          type: String,
          enum: ['Point'],
        },
        coordinates: {
          type: [Number], // [longitude, latitude]
        },
      },
      activeDeliveries: {
        type: Number,
        default: 0,
        min: 0,
      },
      maxConcurrentDeliveries: {
        type: Number,
        default: 5,
      },
    },

    // ── Auth tokens ──
    refreshTokenHash: {
      type: String,
      default: null,
      // Hashed refresh token. Null = no active session.
      // We store hash, never plaintext. Rotate on every refresh.
    },

    // ── Metadata ──
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true, // createdAt, updatedAt
    toJSON: {
      transform(doc, ret) {
        delete ret.refreshTokenHash;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// ── Indexes ──
userSchema.index({ 'deliveryProfile.isAvailable': 1, role: 1 });
// For finding available delivery partners quickly
userSchema.index({ 'deliveryProfile.currentLocation': '2dsphere' });
// For geospatial queries (nearest delivery partner)

module.exports = mongoose.model('User', userSchema);
```

**Design decisions:**
- **Single collection for all roles** — at <10K users, separate collections would just complicate joins. Role field + sparse indexes keep it fast.
- **`company` is a ref, not embedded** — companies have their own data (address, GST) shared across multiple users from the same org.
- **`deliveryProfile` is a subdocument, not a separate collection** — it's 1:1 with the user. No reason to pay for a join.
- **`refreshTokenHash`** — we store only the bcrypt hash, not the plaintext. If someone dumps the DB, tokens are useless.
- **`sparse: true` on `googleId`** — allows admin accounts created manually (no Google login) without violating the unique constraint.
- **GeoJSON** on delivery location — lets us later query `$near` to find closest available partner.

---

## 2. Company Schema

**Collection:** `companies`
**Purpose:** The business entity placing orders. Multiple users can belong to one company.

```javascript
// src/modules/auth/company.model.js
const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema(
  {
    line1: { type: String, required: true, trim: true },
    line2: { type: String, trim: true, default: '' },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    pincode: { type: String, required: true, trim: true },
    country: { type: String, default: 'India', trim: true },
  },
  { _id: false }
);

const companySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
      index: true,
    },
    gstin: {
      type: String,
      uppercase: true,
      trim: true,
      default: null,
      // GST number for invoicing. Not required (small businesses may not have it)
    },
    pan: {
      type: String,
      uppercase: true,
      trim: true,
      default: null,
    },
    billingAddress: {
      type: addressSchema,
      required: true,
    },
    shippingAddresses: {
      type: [addressSchema],
      default: [],
      validate: [arr => arr.length <= 10, 'Maximum 10 shipping addresses'],
    },
    contactEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    contactPhone: {
      type: String,
      required: true,
      trim: true,
    },

    // ── Credit/Payment terms ──
    creditLimit: {
      type: Number, // in paisa
      default: 0,
      min: 0,
      // 0 = pay upfront. > 0 = can place orders on credit up to this amount.
    },
    outstandingBalance: {
      type: Number, // in paisa
      default: 0,
      min: 0,
    },
    paymentTermsDays: {
      type: Number,
      default: 0,
      min: 0,
      // Net payment terms: 0 = immediate, 30 = net-30, etc.
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Company', companySchema);
```

**Design decisions:**
- **Separate from User** — a company is an org, not a person. Multiple employees can belong to one company.
- **`shippingAddresses` array** — companies ship to multiple offices/warehouses. Capped at 10 to prevent abuse.
- **`creditLimit` / `outstandingBalance`** — B2B often means credit terms. This lets admin set per-company credit. Checkout checks `outstandingBalance + orderTotal <= creditLimit` before allowing credit orders.
- **`paymentTermsDays`** — net-30, net-60 etc. Drives invoice due-date calculation.
- **Money in paisa** — ₹5,000 = 500000 paisa. Stored as integer to avoid `0.1 + 0.2 !== 0.3`.

---

## 3. Product Schema

**Collection:** `products`
**Purpose:** Stationery catalog with tiered bulk pricing.

```javascript
// src/modules/catalog/product.model.js
const mongoose = require('mongoose');

const priceTierSchema = new mongoose.Schema(
  {
    minQty: { type: Number, required: true, min: 1 },
    maxQty: { type: Number, default: null }, // null = unlimited (highest tier)
    pricePerUnit: { type: Number, required: true, min: 0 }, // paisa
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    // ── Identity ──
    sku: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      // Format: CAT-XXXX (e.g., PEN-0001, NTB-0042)
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      // Auto-generated from name. Used in URLs.
    },
    description: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },

    // ── Categorization ──
    category: {
      type: String,
      required: true,
      trim: true,
      index: true,
      // e.g., "Pens", "Notebooks", "Paper", "Desk Accessories"
    },
    subcategory: {
      type: String,
      trim: true,
      default: null,
      // e.g., "Ballpoint Pens", "Spiral Notebooks"
    },
    brand: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    tags: {
      type: [String],
      default: [],
      // Free-form: ["eco-friendly", "premium", "school-supply"]
    },

    // ── Pricing ──
    basePrice: {
      type: Number,
      required: true,
      min: 0,
      // paisa. The default/retail price (quantity = 1).
    },
    priceTiers: {
      type: [priceTierSchema],
      default: [],
      // Sorted by minQty ascending. If empty, basePrice applies to all quantities.
      // Example:
      // [
      //   { minQty: 1,   maxQty: 49,   pricePerUnit: 5000 },   // ₹50
      //   { minQty: 50,  maxQty: 199,  pricePerUnit: 4500 },   // ₹45
      //   { minQty: 200, maxQty: null,  pricePerUnit: 4000 },   // ₹40
      // ]
    },
    gstRate: {
      type: Number,
      required: true,
      default: 18,
      // GST percentage. 18 = 18%. Stored as integer.
    },
    hsnCode: {
      type: String,
      trim: true,
      default: null,
      // Harmonized System code for tax classification
    },

    // ── Inventory ──
    stock: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      index: true,
    },
    lowStockThreshold: {
      type: Number,
      default: 50,
      min: 0,
    },
    minOrderQty: {
      type: Number,
      default: 1,
      min: 1,
    },
    maxOrderQty: {
      type: Number,
      default: 10000,
      min: 1,
    },
    unit: {
      type: String,
      default: 'piece',
      enum: ['piece', 'pack', 'box', 'ream', 'dozen', 'set'],
    },

    // ── Media ──
    images: {
      type: [String],
      default: [],
      validate: [arr => arr.length <= 8, 'Maximum 8 images per product'],
      // Relative paths: "/uploads/products/PEN-0001-1.jpg"
    },
    thumbnail: {
      type: String,
      default: null,
      // Primary display image. Usually images[0].
    },

    // ── Attributes ──
    attributes: {
      type: Map,
      of: String,
      default: {},
      // Flexible key-value for product-specific data:
      // { color: "Blue", inkType: "Gel", pageCount: "200", size: "A4" }
    },

    // ── Ratings (denormalized from Feedback) ──
    avgRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    totalReviews: {
      type: Number,
      default: 0,
      min: 0,
    },

    // ── Status ──
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      // Soft delete. Products referenced by past orders can't be hard-deleted.
    },
  },
  { timestamps: true }
);

// ── Indexes ──
// Text search on name, description, brand, tags
productSchema.index(
  { name: 'text', description: 'text', brand: 'text', tags: 'text' },
  {
    weights: { name: 10, brand: 5, tags: 3, description: 1 },
    name: 'product_text_search',
  }
);
// Catalog browsing: active products in a category, sorted by name
productSchema.index({ isActive: 1, isDeleted: 1, category: 1, name: 1 });
// Low stock alert for admin
productSchema.index({ stock: 1, lowStockThreshold: 1, isActive: 1 });

module.exports = mongoose.model('Product', productSchema);
```

**Design decisions:**
- **`priceTiers` embedded array** — bulk pricing is integral to B2B. The service layer resolves the correct tier for a given quantity at checkout. Sorted ascending by `minQty`.
- **`attributes` as a Map** — pens have ink type, paper has GSM, notebooks have page count. A rigid schema would either be incomplete or bloated. Map gives per-product flexibility with no schema migrations.
- **`avgRating` / `totalReviews` denormalized** — avoids aggregating feedback on every product list. Updated atomically when a review is submitted: `newAvg = (oldAvg * oldCount + newRating) / (oldCount + 1)`.
- **Soft delete** — orders reference products. Hard delete would break order history. `isDeleted: true` hides from catalog, preserves in orders.
- **Text index with weights** — name matches rank highest. "Blue gel pen" finds it whether user searches "gel", "blue", or "pen".
- **GST rate and HSN per product** — Indian tax compliance. Different stationery items have different GST rates.
- **Money in paisa** — consistent with the whole system.

---

## 4. Cart Schema

**Collection:** `carts`
**Purpose:** Persistent server-side cart. One active cart per client.

```javascript
// src/modules/orders/cart.model.js
const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    // Snapshot at time of add-to-cart (for display). Re-validated at checkout.
    pricePerUnit: {
      type: Number,
      required: true,
      min: 0,
    },
    // These are informational only — the real price is computed at checkout
    // from the live product. Prevents stale-price orders.
  },
  { _id: true, timestamps: false }
);

const cartSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true, // one cart per user
      index: true,
    },
    items: {
      type: [cartItemSchema],
      default: [],
      validate: [arr => arr.length <= 100, 'Maximum 100 distinct items in cart'],
    },
    // No total stored — always computed from live product prices at checkout
  },
  { timestamps: true }
);

module.exports = mongoose.model('Cart', cartSchema);
```

**Design decisions:**
- **Server-side cart** — survives browser close and device switches. Essential for B2B users who may build carts over days.
- **`unique: true` on `user`** — enforces one active cart per user at the DB level.
- **Price snapshot is informational only** — the checkout service re-computes every line item from live product prices. Prevents exploits where someone adds to cart at ₹40, price goes to ₹45, and they get the old price.
- **No stored total** — always computed server-side. Avoids stale data and tampering.
- **100-item cap** — business guard against abuse.

---

## 5. Order Schema

**Collection:** `orders`
**Purpose:** The core transactional entity. Immutable once created (status transitions, never field edits).

```javascript
// src/modules/orders/order.model.js
const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    // ── Snapshot at order creation (immutable record) ──
    productSnapshot: {
      sku: { type: String, required: true },
      name: { type: String, required: true },
      category: { type: String, required: true },
      unit: { type: String, required: true },
      gstRate: { type: Number, required: true },
      hsnCode: { type: String, default: null },
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    pricePerUnit: {
      type: Number,
      required: true,
      min: 0,
      // paisa — resolved from priceTiers at checkout
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
      // quantity * pricePerUnit (paisa)
    },
    gstAmount: {
      type: Number,
      required: true,
      min: 0,
      // subtotal * (gstRate / 100) in paisa
    },
    total: {
      type: Number,
      required: true,
      min: 0,
      // subtotal + gstAmount (paisa)
    },
  },
  { _id: true }
);

const statusHistorySchema = new mongoose.Schema(
  {
    status: { type: String, required: true },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    note: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    // ── Identity ──
    orderNumber: {
      type: String,
      required: true,
      unique: true,
      // Format: ORD-2026-00001 (sequential per year)
    },

    // ── Parties ──
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },

    // ── Line items ──
    items: {
      type: [orderItemSchema],
      required: true,
      validate: [arr => arr.length > 0, 'Order must have at least one item'],
    },

    // ── Totals (computed at checkout, immutable after) ──
    subtotal: {
      type: Number,
      required: true,
      min: 0,
      // Sum of all items' subtotals (paisa)
    },
    totalGst: {
      type: Number,
      required: true,
      min: 0,
      // Sum of all items' gstAmount (paisa)
    },
    grandTotal: {
      type: Number,
      required: true,
      min: 0,
      // subtotal + totalGst (paisa)
    },

    // ── Shipping ──
    shippingAddress: {
      line1: { type: String, required: true },
      line2: { type: String, default: '' },
      city: { type: String, required: true },
      state: { type: String, required: true },
      pincode: { type: String, required: true },
      country: { type: String, default: 'India' },
    },

    // ── Status ──
    status: {
      type: String,
      enum: [
        'pending_payment',
        'confirmed',
        'processing',
        'shipped',
        'out_for_delivery',
        'delivered',
        'cancelled',
        'rejected',
        'refunded',
      ],
      default: 'pending_payment',
      index: true,
    },
    statusHistory: {
      type: [statusHistorySchema],
      default: [],
      // Append-only audit trail of every status change
    },

    // ── Payment reference ──
    paymentMethod: {
      type: String,
      enum: ['razorpay', 'credit', 'bank_transfer'],
      required: true,
    },

    // ── Admin ──
    adminNotes: {
      type: String,
      default: '',
      maxlength: 1000,
    },
    rejectionReason: {
      type: String,
      default: null,
    },

    // ── Delivery (populated when assigned) ──
    delivery: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Delivery',
      default: null,
    },

    // ── Invoice (populated when generated) ──
    invoice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice',
      default: null,
    },
  },
  { timestamps: true }
);

// ── Indexes ──
// Client's order history, newest first
orderSchema.index({ client: 1, createdAt: -1 });
// Admin order management: filter by status, sorted by date
orderSchema.index({ status: 1, createdAt: -1 });
// Company-level order history
orderSchema.index({ company: 1, createdAt: -1 });

module.exports = mongoose.model('Order', orderSchema);
```

**Design decisions:**
- **`productSnapshot` inside each order item** — critical for B2B. If a product's name/price/GST changes later, the order record must reflect what was actually ordered. This is a legal/tax requirement.
- **`statusHistory` append-only array** — full audit trail. Never overwrite, always push. Shows who changed what and when.
- **Money in paisa throughout** — subtotal, GST, and grand total all integers. No floating point.
- **GST per line item** — different products can have different GST rates (pens 18%, some paper 12%). Total GST is the sum, not a flat rate.
- **`paymentMethod: 'credit'`** — B2B companies with credit terms can place orders without immediate Razorpay payment. Their `outstandingBalance` increments instead.
- **`delivery` and `invoice` are refs, not embedded** — delivery has its own lifecycle (location updates, events). Invoice is its own legal document. They're 1:1 with order but have independent read patterns.

---

## 6. Payment Schema

**Collection:** `payments`
**Purpose:** Immutable payment records. One Razorpay payment per attempt; multiple attempts possible per order.

```javascript
// src/modules/payments/payment.model.js
const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    // ── References ──
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // ── Razorpay identifiers ──
    razorpayOrderId: {
      type: String,
      required: true,
      unique: true,
      // Created via razorpay.orders.create() before checkout
    },
    razorpayPaymentId: {
      type: String,
      default: null,
      sparse: true,
      unique: true,
      // Populated on successful payment, via webhook or client callback
    },
    razorpaySignature: {
      type: String,
      default: null,
      // For server-side signature verification
    },

    // ── Amount ──
    amount: {
      type: Number,
      required: true,
      min: 0,
      // paisa
    },
    currency: {
      type: String,
      default: 'INR',
    },

    // ── Status ──
    status: {
      type: String,
      enum: ['created', 'authorized', 'captured', 'failed', 'refunded', 'partially_refunded'],
      default: 'created',
      index: true,
    },

    // ── Refund tracking ──
    refunds: [
      {
        razorpayRefundId: { type: String, required: true },
        amount: { type: Number, required: true, min: 0 },
        reason: { type: String, default: '' },
        status: {
          type: String,
          enum: ['pending', 'processed', 'failed'],
          default: 'pending',
        },
        createdAt: { type: Date, default: Date.now },
      },
    ],

    // ── Metadata ──
    method: {
      type: String,
      default: null,
      // "upi", "card", "netbanking", "wallet" — from Razorpay webhook
    },
    failureReason: {
      type: String,
      default: null,
    },
    webhookEvents: [
      {
        eventType: { type: String, required: true },
        receivedAt: { type: Date, default: Date.now },
        // Append-only log of webhook events for this payment
      },
    ],
  },
  {
    timestamps: true,
  }
);

// ── Indexes ──
paymentSchema.index({ razorpayOrderId: 1 });

module.exports = mongoose.model('Payment', paymentSchema);
```

**Design decisions:**
- **Immutable pattern** — status only moves forward. We never update `amount` or overwrite fields. New events append to `webhookEvents`.
- **`razorpayPaymentId` is `sparse unique`** — null until payment succeeds, then unique. Prevents duplicate processing.
- **`webhookEvents` array** — debugging lifesaver. If a payment is stuck, you can trace every webhook hit.
- **Refunds are embedded** — they're always read in context of the payment. One less query.
- **Multiple payments per order possible** — first attempt fails, user retries = second payment doc with a new `razorpayOrderId`. Only the `captured` one matters.

---

## 7. Invoice Schema

**Collection:** `invoices`
**Purpose:** Legal tax invoice document. Generated on order confirmation.

```javascript
// src/modules/invoices/invoice.model.js
const mongoose = require('mongoose');

const invoiceLineItemSchema = new mongoose.Schema(
  {
    description: { type: String, required: true },
    sku: { type: String, required: true },
    hsnCode: { type: String, default: null },
    quantity: { type: Number, required: true, min: 1 },
    unit: { type: String, required: true },
    pricePerUnit: { type: Number, required: true, min: 0 },
    subtotal: { type: Number, required: true, min: 0 },
    gstRate: { type: Number, required: true },
    cgst: { type: Number, required: true, min: 0 },
    sgst: { type: Number, required: true, min: 0 },
    igst: { type: Number, required: true, min: 0 },
    // CGST+SGST for intra-state, IGST for inter-state
    total: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const invoiceSchema = new mongoose.Schema(
  {
    // ── Identity ──
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
      // Format: INV-2026-00001 (sequential per financial year)
    },

    // ── References ──
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      unique: true, // one invoice per order
    },

    // ── Parties (snapshot — not refs, because this is a legal document) ──
    seller: {
      name: { type: String, required: true },
      gstin: { type: String, required: true },
      address: { type: String, required: true },
    },
    buyer: {
      name: { type: String, required: true },
      companyName: { type: String, required: true },
      gstin: { type: String, default: null },
      address: { type: String, required: true },
    },

    // ── Line items ──
    lineItems: {
      type: [invoiceLineItemSchema],
      required: true,
    },

    // ── Totals ──
    subtotal: { type: Number, required: true, min: 0 },
    totalCgst: { type: Number, required: true, min: 0 },
    totalSgst: { type: Number, required: true, min: 0 },
    totalIgst: { type: Number, required: true, min: 0 },
    grandTotal: { type: Number, required: true, min: 0 },
    amountInWords: { type: String, required: true },

    // ── Payment info ──
    paymentMethod: { type: String, required: true },
    paymentStatus: {
      type: String,
      enum: ['paid', 'unpaid', 'partial'],
      required: true,
    },
    dueDate: { type: Date, default: null },

    // ── File ──
    pdfPath: {
      type: String,
      default: null,
      // Path to generated PDF: "/uploads/invoices/INV-2026-00001.pdf"
    },

    // ── Metadata ──
    issuedAt: { type: Date, default: Date.now },
    financialYear: {
      type: String,
      required: true,
      // "2025-26", "2026-27"
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Invoice', invoiceSchema);
```

**Design decisions:**
- **Fully self-contained snapshot** — seller and buyer info is copied, not referenced. An invoice is a legal document; if the company changes its address later, the old invoice must still show the original.
- **CGST/SGST/IGST split** — Indian GST requires this. Intra-state = CGST+SGST (each half of total GST), inter-state = IGST (full GST). Determined by comparing seller state vs buyer state at invoice generation time.
- **Sequential `invoiceNumber`** — per financial year. Generated atomically via the Counter collection (see below).
- **`amountInWords`** — legal requirement for Indian tax invoices.

---

## 8. Delivery Schema

**Collection:** `deliveries`
**Purpose:** Tracks delivery assignment, status, and location for an order.

```javascript
// src/modules/delivery/delivery.model.js
const mongoose = require('mongoose');

const trackingEventSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      required: true,
      enum: [
        'assigned',
        'picked_up',
        'in_transit',
        'out_for_delivery',
        'delivered',
        'failed_attempt',
        'returned',
      ],
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
      },
      coordinates: {
        type: [Number], // [lng, lat]
      },
    },
    note: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const deliverySchema = new mongoose.Schema(
  {
    // ── References ──
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      unique: true,
      index: true,
    },
    partner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User', // role = 'delivery'
      required: true,
      index: true,
    },

    // ── Addresses ──
    pickupAddress: {
      line1: String,
      line2: String,
      city: String,
      state: String,
      pincode: String,
    },
    dropoffAddress: {
      line1: String,
      line2: String,
      city: String,
      state: String,
      pincode: String,
    },

    // ── Status ──
    status: {
      type: String,
      enum: [
        'assigned',
        'picked_up',
        'in_transit',
        'out_for_delivery',
        'delivered',
        'failed_attempt',
        'returned',
      ],
      default: 'assigned',
      index: true,
    },

    // ── Live tracking ──
    currentLocation: {
      type: {
        type: String,
        enum: ['Point'],
      },
      coordinates: {
        type: [Number],
      },
    },
    lastLocationUpdate: {
      type: Date,
      default: null,
    },

    // ── Event log ──
    trackingEvents: {
      type: [trackingEventSchema],
      default: [],
      // Append-only. Every status change or location ping adds an event.
    },

    // ── Timing ──
    estimatedDeliveryAt: {
      type: Date,
      default: null,
    },
    actualDeliveryAt: {
      type: Date,
      default: null,
    },

    // ── Proof of delivery ──
    deliveryProof: {
      receiverName: { type: String, default: null },
      receiverPhone: { type: String, default: null },
      signatureImage: { type: String, default: null },
      photoUrl: { type: String, default: null },
    },
  },
  { timestamps: true }
);

// ── Indexes ──
deliverySchema.index({ 'currentLocation': '2dsphere' });
deliverySchema.index({ partner: 1, status: 1 });

module.exports = mongoose.model('Delivery', deliverySchema);
```

**Design decisions:**
- **Separate from Order** — delivery has its own lifecycle, location updates every ~30 seconds, and a different read pattern (delivery partner reads their queue; client reads tracking; admin reads all).
- **`trackingEvents` append-only** — full history of every location ping and status change. This is what the tracking page renders.
- **`currentLocation` GeoJSON** — separate from events for quick reads. Updated frequently via Socket.io; `lastLocationUpdate` prevents stale data display.
- **`deliveryProof`** — receiver name + photo. Standard for B2B. Settles disputes.

---

## 9. Feedback Schema

**Collection:** `feedbacks`
**Purpose:** Post-delivery ratings and reviews.

```javascript
// src/modules/feedback/feedback.model.js
const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema(
  {
    // ── References ──
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      index: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },

    // ── Review content ──
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    title: {
      type: String,
      trim: true,
      maxlength: 200,
      default: '',
    },
    comment: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },

    // ── Moderation ──
    isApproved: {
      type: Boolean,
      default: true,
      // Auto-approved by default. Admin can flag.
    },
    adminResponse: {
      type: String,
      default: null,
      maxlength: 1000,
    },
  },
  { timestamps: true }
);

// ── Constraints ──
// One review per product per order per user
feedbackSchema.index({ order: 1, product: 1, user: 1 }, { unique: true });
// Product reviews listing
feedbackSchema.index({ product: 1, isApproved: 1, createdAt: -1 });

module.exports = mongoose.model('Feedback', feedbackSchema);
```

**Design decisions:**
- **Per-product, per-order** — a single order with 5 items can have 5 reviews. More useful than a single "order review".
- **Unique compound index** — enforces one review per product per order at the DB level. No application-level race conditions.
- **`adminResponse`** — admin can reply to reviews. Standard for B2B reputation management.
- **`company` stored** — enables admin to see feedback grouped by company for account management.

---

## 10. Audit Log Schema

**Collection:** `auditLogs`
**Purpose:** Immutable record of admin actions. Compliance and debugging.

```javascript
// src/common/auditLog.model.js
const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    action: {
      type: String,
      required: true,
      // e.g., "order.reject", "user.roleChange", "product.delete",
      //       "payment.refund", "delivery.assign"
    },
    resource: {
      type: { type: String, required: true }, // "Order", "User", "Product"
      id: { type: mongoose.Schema.Types.ObjectId, required: true },
    },
    changes: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
      // { from: { status: "confirmed" }, to: { status: "rejected" } }
    },
    ipAddress: { type: String, default: null },
    userAgent: { type: String, default: null },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    // No updatedAt — audit logs are immutable
  }
);

// ── Indexes ──
auditLogSchema.index({ 'resource.type': 1, 'resource.id': 1, createdAt: -1 });
auditLogSchema.index({ actor: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

// Prevent modification after creation
auditLogSchema.pre('findOneAndUpdate', function () {
  throw new Error('Audit logs cannot be modified');
});
auditLogSchema.pre('updateOne', function () {
  throw new Error('Audit logs cannot be modified');
});
auditLogSchema.pre('updateMany', function () {
  throw new Error('Audit logs cannot be modified');
});

module.exports = mongoose.model('AuditLog', auditLogSchema);
```

---

## 11. Counter Schema

**Collection:** `counters`
**Purpose:** Atomic sequential number generation for order numbers and invoice numbers.

```javascript
// src/common/counter.model.js
const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true,
    // e.g., "orderNumber-2026", "invoiceNumber-2025-26"
  },
  seq: {
    type: Number,
    default: 0,
  },
});

/**
 * Atomically increment and return the next sequence value.
 * Usage: const next = await Counter.getNext('orderNumber-2026');
 * Returns: 1, 2, 3, ... (never duplicates, even under concurrency)
 */
counterSchema.statics.getNext = async function (counterName) {
  const result = await this.findOneAndUpdate(
    { _id: counterName },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  return result.seq;
};

module.exports = mongoose.model('Counter', counterSchema);
```

**Usage in order service:**
```javascript
const seq = await Counter.getNext(`orderNumber-${year}`);
const orderNumber = `ORD-${year}-${String(seq).padStart(5, '0')}`;
// → "ORD-2026-00001", "ORD-2026-00002", ...
```

**Why not UUID?** — sequential numbers are human-readable, phone-friendly, and let admin/CS say "your order ORD-2026-00042." `findOneAndUpdate` with `$inc` is atomic under concurrency.

---

## 12. Index Strategy

Summary of all indexes and their purpose:

| Collection | Index | Type | Purpose |
|---|---|---|---|
| users | `email` | unique | Login lookup |
| users | `googleId` | unique, sparse | OAuth lookup |
| users | `role` | regular | Filter by role |
| users | `deliveryProfile.isAvailable, role` | compound | Find available partners |
| users | `deliveryProfile.currentLocation` | 2dsphere | Nearest partner |
| products | `sku` | unique | SKU lookup |
| products | `slug` | unique | URL lookup |
| products | `name, description, brand, tags` | text (weighted) | Search |
| products | `isActive, isDeleted, category, name` | compound | Catalog browsing |
| products | `stock, lowStockThreshold, isActive` | compound | Low stock alerts |
| carts | `user` | unique | One cart per user |
| orders | `orderNumber` | unique | Order lookup |
| orders | `client, createdAt` | compound | Client history |
| orders | `status, createdAt` | compound | Admin dashboard |
| orders | `company, createdAt` | compound | Company history |
| payments | `razorpayOrderId` | unique | Razorpay lookup |
| payments | `razorpayPaymentId` | unique, sparse | Idempotent webhook |
| payments | `order` | regular | Order payment history |
| invoices | `invoiceNumber` | unique | Invoice lookup |
| invoices | `order` | unique | One invoice per order |
| deliveries | `order` | unique | One delivery per order |
| deliveries | `partner, status` | compound | Partner's queue |
| deliveries | `currentLocation` | 2dsphere | Geo tracking |
| feedbacks | `order, product, user` | unique compound | One review per item per order |
| feedbacks | `product, isApproved, createdAt` | compound | Product reviews page |
| auditLogs | `resource.type, resource.id, createdAt` | compound | Resource audit trail |
| auditLogs | `actor, createdAt` | compound | User audit trail |

---

## 13. Relationship Map

```
                    ┌─────────────┐
                    │   Company   │
                    │             │
                    │ creditLimit │
                    │ addresses   │
                    └──────┬──────┘
                           │ 1:N
                           ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Product   │     │    User     │     │  AuditLog   │
│             │     │             │     │             │
│ priceTiers  │     │ role        │     │ immutable   │
│ attributes  │     │ company ref │     │ append-only │
│ stock       │     └──────┬──────┘     └─────────────┘
└──────┬──────┘            │
       │                   │ 1:1
       │            ┌──────▼──────┐
       │            │    Cart     │──── items[] ──▶ Product (ref)
       │            │  (per user) │
       │            └──────┬──────┘
       │                   │ checkout
       │                   ▼
       │            ┌─────────────┐
       │            │    Order    │
       ├──◀── ref ──│             │
       │            │ items[]     │──── productSnapshot (embedded)
       │            │ statusHist  │
       │            └──┬──┬──┬───┘
       │               │  │  │
       │      ┌────────┘  │  └────────┐
       │      ▼           ▼           ▼
       │ ┌─────────┐ ┌─────────┐ ┌──────────┐
       │ │ Payment │ │Delivery │ │ Invoice  │
       │ │         │ │         │ │          │
       │ │razorpay │ │partner  │ │ GST/HSN  │
       │ │refunds[]│ │tracking │ │ snapshot │
       │ │webhooks │ │events[] │ │ PDF      │
       │ └─────────┘ │location │ └──────────┘
       │              └─────────┘
       │
       ▼
┌─────────────┐
│  Feedback   │
│             │
│ per product │
│ per order   │
│ rating 1-5  │
└─────────────┘
```

---

## Next Step

Phase 2 is complete. Every collection is specified with production-grade schemas, indexes, validators, and the reasoning behind each.

**Ready for Phase 3:** API Design — full REST route structure with request/response examples, error codes, and Razorpay webhook handling. Say the word.
