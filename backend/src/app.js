const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit = require('express-rate-limit');
const path = require('path');

const config = require('./config/env');
const logger = require('./config/logger');
require('./config/passport'); // initialize passport strategies

const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// Route modules
const authRoutes = require('./modules/auth/auth.routes');
const catalogRoutes = require('./modules/catalog/catalog.routes');
const orderRoutes = require('./modules/orders/order.routes');
const paymentRoutes = require('./modules/payments/payment.routes');
const deliveryRoutes = require('./modules/delivery/delivery.routes');
const invoiceRoutes = require('./modules/invoices/invoice.routes');
const feedbackRoutes = require('./modules/feedback/feedback.routes');
const adminRoutes = require('./modules/admin/admin.routes');

function createApp() {
  const app = express();

  // ── Trust proxy (for rate limiting behind nginx/LB) ──
  app.set('trust proxy', 1);

  // ── Security headers ──
  app.use(helmet());

  // ── CORS ──
  app.use(
    cors({
      origin: config.client.corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  // ── Razorpay webhook needs raw body BEFORE json parsing ──
  // Capture raw body for webhook signature verification
  app.use('/api/v1/payments/webhook', express.raw({ type: 'application/json' }), (req, res, next) => {
    req.rawBody = req.body.toString('utf8');
    // Re-parse as JSON for the handler
    try {
      req.body = JSON.parse(req.rawBody);
    } catch {
      req.body = {};
    }
    next();
  });

  // ── Body parsing ──
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());

  // ── Mongo injection protection ──
  app.use(mongoSanitize());

  // ── Request logging ──
  if (config.env !== 'test') {
    app.use(
      morgan('short', {
        stream: { write: (msg) => logger.info(msg.trim()) },
      })
    );
  }

  // ── Rate limiting ──
  const generalLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' },
    },
  });

  const authLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10,
    message: {
      success: false,
      error: { code: 'RATE_LIMITED', message: 'Too many auth attempts. Please try again later.' },
    },
  });

  app.use('/api/v1', generalLimiter);
  app.use('/api/v1/auth', authLimiter);

  // ── Static file serving (uploaded images, invoice PDFs) ──
  app.use('/uploads', express.static(path.resolve(config.upload.dir)));

  // ── Health check ──
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ── API routes ──
  const apiPrefix = '/api/v1';
  app.use(apiPrefix, authRoutes);
  app.use(apiPrefix, catalogRoutes);
  app.use(apiPrefix, orderRoutes);
  app.use(apiPrefix, paymentRoutes);
  app.use(apiPrefix, deliveryRoutes);
  app.use(apiPrefix, invoiceRoutes);
  app.use(apiPrefix, feedbackRoutes);
  app.use(apiPrefix, adminRoutes);

  // ── 404 + Error handling ──
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
