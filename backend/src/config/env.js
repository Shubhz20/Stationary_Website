/**
 * Environment configuration — single source of truth.
 *
 * Loaded once at boot, validated against a Joi schema, frozen.
 * Import this instead of reading process.env anywhere else.
 */
const Joi = require('joi');
const path = require('path');

// Load .env in development only
if (process.env.NODE_ENV !== 'production') {
  try {
    require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
  } catch {
    // dotenv is optional in production
  }
}

const schema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(4000),

  MONGODB_URI: Joi.string().required().description('MongoDB connection string'),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_TTL: Joi.string().default('15m'),
  JWT_REFRESH_TTL: Joi.string().default('7d'),

  GOOGLE_CLIENT_ID: Joi.string().required(),
  GOOGLE_CLIENT_SECRET: Joi.string().required(),
  GOOGLE_CALLBACK_URL: Joi.string().uri().required(),

  CLIENT_URL: Joi.string().uri().required(),
  CORS_ORIGINS: Joi.string().required(), // comma-separated

  RAZORPAY_KEY_ID: Joi.string().required(),
  RAZORPAY_KEY_SECRET: Joi.string().required(),
  RAZORPAY_WEBHOOK_SECRET: Joi.string().required(),

  UPLOAD_DIR: Joi.string().default('./uploads'),
  MAX_FILE_SIZE_MB: Joi.number().default(5),

  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),

  RATE_LIMIT_WINDOW_MS: Joi.number().default(60000),
  RATE_LIMIT_MAX_REQUESTS: Joi.number().default(100),
}).unknown(true); // allow other env vars (PATH, etc.)

const { error, value } = schema.validate(process.env, {
  abortEarly: false,
  stripUnknown: false,
});

if (error) {
  const missing = error.details.map((d) => `  - ${d.message}`).join('\n');
  console.error(`\n❌ Environment validation failed:\n${missing}\n`);
  console.error('Copy .env.example to .env and fill in the values.\n');
  process.exit(1);
}

const config = Object.freeze({
  env: value.NODE_ENV,
  port: value.PORT,
  isProduction: value.NODE_ENV === 'production',

  mongo: {
    uri: value.MONGODB_URI,
  },

  jwt: {
    accessSecret: value.JWT_ACCESS_SECRET,
    refreshSecret: value.JWT_REFRESH_SECRET,
    accessTtl: value.JWT_ACCESS_TTL,
    refreshTtl: value.JWT_REFRESH_TTL,
  },

  google: {
    clientId: value.GOOGLE_CLIENT_ID,
    clientSecret: value.GOOGLE_CLIENT_SECRET,
    callbackUrl: value.GOOGLE_CALLBACK_URL,
  },

  client: {
    url: value.CLIENT_URL,
    corsOrigins: value.CORS_ORIGINS.split(',').map((s) => s.trim()),
  },

  razorpay: {
    keyId: value.RAZORPAY_KEY_ID,
    keySecret: value.RAZORPAY_KEY_SECRET,
    webhookSecret: value.RAZORPAY_WEBHOOK_SECRET,
  },

  upload: {
    dir: path.resolve(value.UPLOAD_DIR),
    maxFileSizeBytes: value.MAX_FILE_SIZE_MB * 1024 * 1024,
  },

  log: {
    level: value.LOG_LEVEL,
  },

  rateLimit: {
    windowMs: value.RATE_LIMIT_WINDOW_MS,
    max: value.RATE_LIMIT_MAX_REQUESTS,
  },
});

module.exports = config;
