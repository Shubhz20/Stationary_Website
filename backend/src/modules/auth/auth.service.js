const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const config = require('../../config/env');
const User = require('./user.model');
const Company = require('./company.model');
const AppError = require('../../common/AppError');
const logger = require('../../config/logger');

class AuthService {
  /**
   * Generate JWT access token.
   */
  generateAccessToken(user) {
    return jwt.sign(
      {
        sub: user._id,
        email: user.email,
        role: user.role,
      },
      config.jwt.accessSecret,
      { expiresIn: config.jwt.accessTtl }
    );
  }

  /**
   * Generate refresh token and store its hash on the user.
   */
  async generateRefreshToken(user) {
    const token = jwt.sign(
      { sub: user._id, type: 'refresh' },
      config.jwt.refreshSecret,
      { expiresIn: config.jwt.refreshTtl }
    );

    // Store only the hash
    const hash = await bcrypt.hash(token, 10);
    user.refreshTokenHash = hash;
    await user.save();

    return token;
  }

  /**
   * Verify refresh token and rotate it.
   * Returns { user, accessToken, refreshToken }.
   */
  async refreshAccessToken(refreshToken) {
    if (!refreshToken) {
      throw AppError.unauthorized('Refresh token required');
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, config.jwt.refreshSecret);
    } catch (err) {
      throw new AppError('Session expired. Please log in again.', 401, 'REFRESH_TOKEN_INVALID');
    }

    const user = await User.findById(decoded.sub).populate('company');
    if (!user || !user.isActive || !user.refreshTokenHash) {
      throw new AppError('Session expired. Please log in again.', 401, 'REFRESH_TOKEN_INVALID');
    }

    // Verify the token matches the stored hash
    const isValid = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!isValid) {
      // Possible token reuse attack — invalidate all sessions
      user.refreshTokenHash = null;
      await user.save();
      logger.warn(`Possible refresh token reuse for user ${user._id}`);
      throw new AppError('Session expired. Please log in again.', 401, 'REFRESH_TOKEN_INVALID');
    }

    // Rotate: generate new tokens
    const accessToken = this.generateAccessToken(user);
    const newRefreshToken = await this.generateRefreshToken(user);

    return { user, accessToken, refreshToken: newRefreshToken };
  }

  /**
   * Logout — invalidate refresh token.
   */
  async logout(userId) {
    await User.findByIdAndUpdate(userId, { refreshTokenHash: null });
  }

  /**
   * Update user profile (name, phone).
   */
  async updateProfile(userId, data) {
    const user = await User.findByIdAndUpdate(userId, data, {
      new: true,
      runValidators: true,
    }).populate('company');

    if (!user) throw AppError.notFound('User');
    return user;
  }

  /**
   * Create or link company for a client user.
   */
  async createCompany(userId, data) {
    const user = await User.findById(userId);
    if (!user) throw AppError.notFound('User');
    if (user.company) {
      throw AppError.conflict('You are already associated with a company');
    }

    // Check if company with same GSTIN exists
    let company = null;
    if (data.gstin) {
      company = await Company.findOne({ gstin: data.gstin });
    }

    if (!company) {
      company = await Company.create(data);
      logger.info(`Company created: ${company.name} (${company._id})`);
    }

    user.company = company._id;
    await user.save();

    return company;
  }

  /**
   * Get company by ID (with ownership check for clients).
   */
  async getCompany(companyId, requestingUser) {
    const company = await Company.findById(companyId);
    if (!company) throw AppError.notFound('Company');

    // Clients can only see their own company
    if (
      requestingUser.role === 'client' &&
      String(requestingUser.company?._id || requestingUser.company) !== String(companyId)
    ) {
      throw AppError.forbidden('You can only view your own company');
    }

    return company;
  }

  /**
   * Update company. Clients can update non-financial fields only.
   */
  async updateCompany(companyId, data, requestingUser) {
    const company = await Company.findById(companyId);
    if (!company) throw AppError.notFound('Company');

    // Clients can only update their own company
    if (requestingUser.role === 'client') {
      if (String(requestingUser.company?._id || requestingUser.company) !== String(companyId)) {
        throw AppError.forbidden('You can only update your own company');
      }
      // Strip admin-only fields
      delete data.creditLimit;
      delete data.paymentTermsDays;
      delete data.outstandingBalance;
    }

    Object.assign(company, data);
    await company.save();
    return company;
  }
}

module.exports = new AuthService();
