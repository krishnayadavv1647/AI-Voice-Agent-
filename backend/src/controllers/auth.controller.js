import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { signToken } from "../utils/token.js";
import User from "../models/User.js";

function ensureJwtConfigured() {
  if (!process.env.JWT_SECRET) throw new ApiError(500, "JWT_SECRET is missing in backend environment");
}

function authResponse(user) {
  return {
    token: signToken(user),
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      plan: user.plan,
      minutesUsed: user.minutesUsed
    }
  };
}

export const signup = asyncHandler(async (req, res) => {
  const { name, email, password, confirmPassword } = req.body;
  ensureJwtConfigured();
  if (!name || !email || !password || !confirmPassword) throw new ApiError(400, "All signup fields are required");
  if (password !== confirmPassword) throw new ApiError(400, "Passwords do not match");

  const exists = await User.findOne({ email: email.toLowerCase().trim() });
  if (exists) throw new ApiError(409, "Email is already registered");

  const user = await User.create({ name: name.trim(), email: email.toLowerCase().trim(), password });
  res.status(201).json(authResponse(user));
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  ensureJwtConfigured();
  if (!email || !password) throw new ApiError(400, "Email and password are required");

  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user || !(await user.matchPassword(password))) throw new ApiError(401, "Invalid email or password");

  res.json(authResponse(user));
});

export const me = asyncHandler(async (req, res) => {
  res.json({ user: req.user });
});
