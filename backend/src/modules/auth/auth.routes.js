const router = require('express').Router();
const passport = require('passport');
const controller = require('./auth.controller');
const { authenticate, requireRole } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const {
  updateProfileSchema,
  createCompanySchema,
  updateCompanySchema,
} = require('./auth.validator');

// ── Google OAuth ──
router.get(
  '/auth/google',
  passport.authenticate('google', { scope: ['openid', 'email', 'profile'], session: false })
);

router.get(
  '/auth/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/auth/login-failed' }),
  controller.googleCallback
);

// ── Token management ──
router.post('/auth/refresh', controller.refresh);
router.post('/auth/logout', authenticate, controller.logout);
router.get('/auth/me', authenticate, controller.getMe);

// ── Profile ──
router.patch(
  '/users/profile',
  authenticate,
  validate(updateProfileSchema, 'body'),
  controller.updateProfile
);

// ── Company ──
router.post(
  '/users/company',
  authenticate,
  requireRole('client'),
  validate(createCompanySchema, 'body'),
  controller.createCompany
);

router.get(
  '/companies/:companyId',
  authenticate,
  requireRole('client', 'admin'),
  controller.getCompany
);

router.patch(
  '/companies/:companyId',
  authenticate,
  requireRole('client', 'admin'),
  validate(updateCompanySchema, 'body'),
  controller.updateCompany
);

module.exports = router;
