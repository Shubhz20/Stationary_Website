const logger = require('../config/logger');
const AppError = require('../common/AppError');
const config = require('../config/env');

/**
 * Global error handling middleware.
 * Must be registered LAST (after all routes).
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  // Default to 500
  let statusCode = err.statusCode || 500;
  let code = err.code || 'INTERNAL_ERROR';
  let message = err.message || 'Something went wrong';
  let details = err.details || null;

  // ── Handle specific Mongoose errors ──

  // Duplicate key
  if (err.code === 11000) {
    statusCode = 409;
    code = 'DUPLICATE_RESOURCE';
    const field = Object.keys(err.keyPattern || {})[0] || 'unknown';
    message = `Duplicate value for '${field}'`;
    details = { field, value: err.keyValue?.[field] };
  }

  // Validation error (Mongoose)
  if (err.name === 'ValidationError') {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Validation failed';
    details = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
  }

  // Cast error (invalid ObjectId)
  if (err.name === 'CastError') {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = `Invalid ${err.path}: ${err.value}`;
  }

  // ── Log ──
  if (statusCode >= 500) {
    logger.error(`${statusCode} ${code}: ${message}`, {
      stack: err.stack,
      url: req.originalUrl,
      method: req.method,
      ip: req.ip,
      userId: req.user?._id,
    });
  } else if (statusCode >= 400) {
    logger.warn(`${statusCode} ${code}: ${message}`, {
      url: req.originalUrl,
      method: req.method,
    });
  }

  // ── Response ──
  const response = {
    success: false,
    error: {
      code,
      message,
    },
  };

  if (details) {
    response.error.details = details;
  }

  // Include stack trace in development only
  if (!config.isProduction && err.stack) {
    response.error.stack = err.stack;
  }

  res.status(statusCode).json(response);
};

/**
 * 404 handler for undefined routes.
 * Register BEFORE errorHandler but AFTER all route registrations.
 */
const notFoundHandler = (req, res, next) => {
  next(AppError.notFound(`Route ${req.method} ${req.originalUrl}`));
};

module.exports = { errorHandler, notFoundHandler };
