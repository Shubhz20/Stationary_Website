/**
 * Scheduled maintenance jobs.
 *
 * Run via:   node src/scripts/jobs.js
 * Or cron:   0 2 * * * cd /app && node src/scripts/jobs.js >> /var/log/jobs.log 2>&1
 *
 * Jobs:
 *  1. cleanExpiredCarts   — remove carts not updated in 7 days
 *  2. creditPaymentAlerts — log overdue credit orders
 *  3. lowStockReport      — log products below reorder threshold
 */

const mongoose = require('mongoose');
const path = require('path');

// Load env
if (process.env.NODE_ENV !== 'production') {
  try {
    require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
  } catch {}
}

const connectDB = require('../config/database');
const logger = require('../config/logger');

// ─── Job 1: Clean expired carts ───
async function cleanExpiredCarts() {
  const Cart = require('../modules/orders/cart.model');
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago

  const result = await Cart.deleteMany({ updatedAt: { $lt: cutoff } });
  logger.info(`[Job] Cleaned ${result.deletedCount} expired carts (older than 7 days)`);
  return result.deletedCount;
}

// ─── Job 2: Credit payment overdue alerts ───
async function creditPaymentAlerts() {
  const Order = require('../modules/orders/order.model');

  // Find credit orders that are delivered but payment is still pending
  // and were delivered more than N days ago (based on company's paymentTermsDays)
  const overdueOrders = await Order.aggregate([
    {
      $match: {
        paymentMethod: 'credit',
        paymentStatus: 'pending',
        status: { $in: ['delivered', 'confirmed', 'processing', 'shipped'] },
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: 'user',
        foreignField: '_id',
        as: 'userDoc',
      },
    },
    { $unwind: '$userDoc' },
    {
      $lookup: {
        from: 'companies',
        localField: 'userDoc.company',
        foreignField: '_id',
        as: 'companyDoc',
      },
    },
    { $unwind: { path: '$companyDoc', preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        daysSinceOrder: {
          $divide: [{ $subtract: [new Date(), '$createdAt'] }, 86400000],
        },
        paymentTermsDays: { $ifNull: ['$companyDoc.paymentTermsDays', 30] },
      },
    },
    {
      $match: {
        $expr: { $gt: ['$daysSinceOrder', '$paymentTermsDays'] },
      },
    },
    {
      $project: {
        orderNumber: 1,
        totalAmount: 1,
        createdAt: 1,
        daysSinceOrder: { $round: ['$daysSinceOrder', 0] },
        companyName: '$companyDoc.name',
        paymentTermsDays: 1,
      },
    },
  ]);

  if (overdueOrders.length > 0) {
    logger.warn(`[Job] ${overdueOrders.length} overdue credit payment(s):`);
    overdueOrders.forEach((o) => {
      logger.warn(
        `  Order ${o.orderNumber} | ${o.companyName} | ₹${(o.totalAmount / 100).toFixed(2)} | ${o.daysSinceOrder} days (terms: ${o.paymentTermsDays}d)`
      );
    });
  } else {
    logger.info('[Job] No overdue credit payments');
  }

  return overdueOrders.length;
}

// ─── Job 3: Low stock report ───
async function lowStockReport() {
  const Product = require('../modules/catalog/product.model');

  const lowStock = await Product.find({
    isActive: true,
    stock: { $lte: 10 },
  })
    .select('name sku stock category')
    .sort({ stock: 1 })
    .lean();

  if (lowStock.length > 0) {
    logger.warn(`[Job] ${lowStock.length} product(s) at low stock:`);
    lowStock.forEach((p) => {
      logger.warn(`  ${p.sku} — ${p.name} — ${p.stock} remaining`);
    });
  } else {
    logger.info('[Job] All products have sufficient stock');
  }

  return lowStock.length;
}

// ─── Runner ───
async function runAllJobs() {
  logger.info('═══ Starting scheduled maintenance jobs ═══');
  const start = Date.now();

  try {
    await connectDB();

    await cleanExpiredCarts();
    await creditPaymentAlerts();
    await lowStockReport();

    const elapsed = ((Date.now() - start) / 1000).toFixed(2);
    logger.info(`═══ All jobs completed in ${elapsed}s ═══`);
  } catch (err) {
    logger.error('[Job] Fatal error:', err);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

// Run if called directly
if (require.main === module) {
  runAllJobs();
}

module.exports = { cleanExpiredCarts, creditPaymentAlerts, lowStockReport };
