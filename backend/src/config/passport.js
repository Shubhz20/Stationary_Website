const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const config = require('./env');
const User = require('../modules/auth/user.model');
const logger = require('./logger');

passport.use(
  new GoogleStrategy(
    {
      clientID: config.google.clientId,
      clientSecret: config.google.clientSecret,
      callbackURL: config.google.callbackUrl,
      scope: ['openid', 'email', 'profile'],
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const { id: googleId, emails, displayName, photos } = profile;
        const email = emails?.[0]?.value;
        const avatar = photos?.[0]?.value || null;

        if (!email) {
          return done(new Error('No email found in Google profile'), null);
        }

        // Upsert: find by googleId or email, create if neither exists
        let user = await User.findOne({
          $or: [{ googleId }, { email: email.toLowerCase() }],
        });

        if (user) {
          // Existing user — update Google info + last login
          user.googleId = googleId;
          user.avatar = avatar || user.avatar;
          user.lastLoginAt = new Date();
          await user.save();
        } else {
          // New user — create with client role
          user = await User.create({
            googleId,
            email: email.toLowerCase(),
            name: displayName || email.split('@')[0],
            avatar,
            role: 'client',
            lastLoginAt: new Date(),
          });
          logger.info(`New user registered via Google: ${email}`);
        }

        if (!user.isActive) {
          return done(new Error('Account is deactivated'), null);
        }

        return done(null, user);
      } catch (err) {
        logger.error('Google OAuth error:', err);
        return done(err, null);
      }
    }
  )
);

// We don't use sessions (JWT-based), but Passport requires these
passport.serializeUser((user, done) => done(null, user._id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

module.exports = passport;
