import express from "express";
import { googleCallbackSuccess, login, me, signup } from "../controllers/auth.controller.js";
import {
  getConfiguredPassport,
  getGoogleOAuthPackageError,
  isGoogleOAuthConfigured
} from "../config/passport.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

async function loadGooglePassport(res) {
  if (!isGoogleOAuthConfigured()) {
    res.status(500).json({
      success: false,
      message: "Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI."
    });
    return null;
  }

  const passport = await getConfiguredPassport();

  if (!passport) {
    const packageError = getGoogleOAuthPackageError();
    res.status(500).json({
      success: false,
      message: "Google OAuth packages are not installed. Run npm install in the backend folder.",
      details: packageError?.message
    });
    return null;
  }

  return passport;
}

router.post("/signup", signup);
router.post("/login", login);
router.get("/google", async (req, res, next) => {
  const passport = await loadGooglePassport(res);
  if (!passport) return;

  passport.initialize()(req, res, () => {
    passport.authenticate("google", {
      scope: ["profile", "email"],
      session: false
    })(req, res, next);
  });
});
router.get("/google/callback", async (req, res, next) => {
  const passport = await loadGooglePassport(res);
  if (!passport) return;

  passport.initialize()(req, res, () => {
    passport.authenticate("google", {
      session: false,
      failureRedirect: `${process.env.CLIENT_URL || "http://localhost:5173"}/login?error=google_auth_failed`
    })(req, res, next);
  });
}, googleCallbackSuccess);
router.get("/me", protect, me);

export default router;
