import User from "../models/User.js";

let configuredPassport = null;
let configurePromise = null;
let packageLoadError = null;

function googleConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REDIRECT_URI
  );
}

export async function getConfiguredPassport() {
  if (configuredPassport) return configuredPassport;
  if (configurePromise) return configurePromise;

  configurePromise = configurePassport();
  return configurePromise;
}

async function configurePassport() {
  let passport;
  let GoogleStrategy;

  try {
    const passportModule = await import("passport");
    const googleModule = await import("passport-google-oauth20");
    passport = passportModule.default || passportModule;
    GoogleStrategy = googleModule.Strategy;
  } catch (error) {
    packageLoadError = error;
    configurePromise = null;
    return null;
  }

  passport.serializeUser((user, done) => done(null, user._id));
  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findById(id);
      done(null, user);
    } catch (error) {
      done(error);
    }
  });

  if (!googleConfigured()) {
    console.warn("Google OAuth is not configured. Email/password auth will still work.");
    configuredPassport = passport;
    return configuredPassport;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_REDIRECT_URI
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value?.toLowerCase();
          if (!email) return done(new Error("Google account did not return an email address"));

          let user = await User.findOne({ email });

          if (user) {
            user.googleId = user.googleId || profile.id;
            user.avatar = user.avatar || profile.photos?.[0]?.value;
            user.authProvider = user.authProvider || "google";
            await user.save();
            return done(null, user);
          }

          user = await User.create({
            googleId: profile.id,
            name: profile.displayName || email.split("@")[0],
            email,
            avatar: profile.photos?.[0]?.value,
            authProvider: "google"
          });

          return done(null, user);
        } catch (error) {
          return done(error);
        }
      }
    )
  );

  configuredPassport = passport;
  return configuredPassport;
}

export function isGoogleOAuthConfigured() {
  return googleConfigured();
}

export function getGoogleOAuthPackageError() {
  return packageLoadError;
}
