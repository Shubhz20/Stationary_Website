const authService = require('./auth.service');
const config = require('../../config/env');
const asyncHandler = require('../../common/asyncHandler');

// Cookie options for refresh token
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: config.isProduction,
  sameSite: config.isProduction ? 'strict' : 'lax',
  path: '/api/v1/auth/refresh', // only sent on refresh requests
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

/**
 * Handle Google OAuth callback.
 * Passport has already authenticated and attached req.user.
 */
const googleCallback = asyncHandler(async (req, res) => {
  const user = req.user;

  const accessToken = authService.generateAccessToken(user);
  const refreshToken = await authService.generateRefreshToken(user);

  // Set refresh token as httpOnly cookie
  res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);

  // Redirect to frontend with access token in fragment
  const redirectUrl = `${config.client.url}/auth/callback#token=${accessToken}`;
  res.redirect(redirectUrl);
});

/**
 * Refresh access token using refresh cookie.
 */
const refresh = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.refreshToken;

  const result = await authService.refreshAccessToken(refreshToken);

  // Rotate refresh cookie
  res.cookie('refreshToken', result.refreshToken, REFRESH_COOKIE_OPTIONS);

  res.json({
    success: true,
    data: {
      accessToken: result.accessToken,
      expiresIn: 900, // 15 minutes in seconds
    },
  });
});

/**
 * Logout — clear refresh token.
 */
const logout = asyncHandler(async (req, res) => {
  await authService.logout(req.user._id);
  res.clearCookie('refreshToken', { path: '/api/v1/auth/refresh' });

  res.json({
    success: true,
    data: { message: 'Logged out successfully' },
  });
});

/**
 * Get current authenticated user.
 */
const getMe = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: { user: req.user },
  });
});

/**
 * Update user profile.
 */
const updateProfile = asyncHandler(async (req, res) => {
  const user = await authService.updateProfile(req.user._id, req.body);
  res.json({
    success: true,
    data: { user },
  });
});

/**
 * Create/link company for current user.
 */
const createCompany = asyncHandler(async (req, res) => {
  const company = await authService.createCompany(req.user._id, req.body);
  res.status(201).json({
    success: true,
    data: { company },
  });
});

/**
 * Get company details.
 */
const getCompany = asyncHandler(async (req, res) => {
  const company = await authService.getCompany(req.params.companyId, req.user);
  res.json({
    success: true,
    data: { company },
  });
});

/**
 * Update company.
 */
const updateCompany = asyncHandler(async (req, res) => {
  const company = await authService.updateCompany(
    req.params.companyId,
    req.body,
    req.user
  );
  res.json({
    success: true,
    data: { company },
  });
});

module.exports = {
  googleCallback,
  refresh,
  logout,
  getMe,
  updateProfile,
  createCompany,
  getCompany,
  updateCompany,
};
