const jwt = require('jsonwebtoken');
const config = require('../config/env');
const User = require('../modules/auth/user.model');
const AppError = require('../common/AppError');
const asyncHandler = require('../common/asyncHandler');

/**
 * Verify JWT access token from Authorization header.
 * Attaches req.user (full Mongoose doc) on success.
 */
const authenticate = asyncHandler(async (req, res, next) => {
  // Extract token from header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw AppError.unauthorized('Access token required');
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, config.jwt.accessSecret);

    // Load user from DB (ensures they still exist and are active)
    const user = await User.findById(decoded.sub).populate('company');
    if (!user) {
      throw AppError.unauthorized('User not found');
    }
    if (!user.isActive) {
      throw AppError.unauthorized('Account is deactivated');
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw AppError.unauthorized('Access token expired');
    }
    if (err.name === 'JsonWebTokenError') {
      throw AppError.unauthorized('Invalid access token');
    }
    throw err;
  }
});

/**
 * Optional authentication — doesn't fail if no token present.
 * Used for routes that behave differently for logged-in users.
 */
const optionalAuth = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, config.jwt.accessSecret);
    const user = await User.findById(decoded.sub).populate('company');
    req.user = user && user.isActive ? user : null;
  } catch {
    req.user = null;
  }
  next();
});

/**
 * Role-based access control middleware factory.
 * Usage: requireRole('admin') or requireRole('admin', 'client')
 *
 * Must be used AFTER authenticate middleware.
 */
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(AppError.unauthorized());
    }
    if (!roles.includes(req.user.role)) {
      return next(
        AppError.forbidden(
          `This action requires one of the following roles: ${roles.join(', ')}`
        )
      );
    }
    next();
  };
};

module.exports = { authenticate, optionalAuth, requireRole };
