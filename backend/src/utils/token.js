import jwt from "jsonwebtoken";
import { ApiError } from "./apiError.js";

export function signToken(user, extra = {}) {
  if (!process.env.JWT_SECRET) {
    throw new ApiError(500, "JWT_SECRET is missing in backend environment");
  }

  return jwt.sign({ id: user._id, role: user.role, ...extra }, process.env.JWT_SECRET, { expiresIn: "7d" });
}
