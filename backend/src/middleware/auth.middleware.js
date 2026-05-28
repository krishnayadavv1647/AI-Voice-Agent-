import jwt from "jsonwebtoken";
import { ApiError } from "../utils/apiError.js";
import User from "../models/User.js";

export async function protect(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) throw new ApiError(401, "Unauthorized");
    if (!process.env.JWT_SECRET) throw new ApiError(500, "JWT_SECRET is missing in backend environment");

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password");
    if (!user || user.status === "suspended") throw new ApiError(401, "Unauthorized");

    req.user = user;
    next();
  } catch (error) {
    next(error.statusCode ? error : new ApiError(401, "Unauthorized"));
  }
}

export function adminOnly(req, res, next) {
  if (req.user?.role !== "admin") return next(new ApiError(403, "Admin access required"));
  next();
}
