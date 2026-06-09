import crypto from "crypto";
import TelegramConnection from "../models/TelegramConnection.js";
import { asyncHandler } from "../utils/asyncHandler.js";

function botUsername() {
  return String(process.env.TELEGRAM_BOT_USERNAME || "").replace(/^@/, "").trim();
}

function botLink() {
  const username = botUsername();
  return username ? `https://t.me/${username}` : "";
}

function publicConnection(connection) {
  return {
    status: connection?.status || "revoked",
    telegramUsername: connection?.telegramUsername || "",
    telegramChatId: connection?.telegramChatId ? String(connection.telegramChatId).replace(/\d(?=\d{4})/g, "*") : "",
    connectedAt: connection?.connectedAt,
    dailySummaryEnabled: Boolean(connection?.dailySummaryEnabled),
    appointmentBookedEnabled: Boolean(connection?.appointmentBookedEnabled),
    hotLeadEnabled: Boolean(connection?.hotLeadEnabled),
    callFailedEnabled: Boolean(connection?.callFailedEnabled),
    botUsername: botUsername() ? `@${botUsername()}` : "",
    botLink: botLink()
  };
}

export const createTelegramConnectCode = asyncHandler(async (req, res) => {
  await TelegramConnection.updateMany(
    { userId: req.user._id, status: "pending" },
    { $set: { status: "revoked", revokedAt: new Date() } }
  );

  const connectCode = `TG-${crypto.randomInt(100000, 999999)}`;
  const connection = await TelegramConnection.create({
    userId: req.user._id,
    connectCode,
    status: "pending"
  });

  res.status(201).json({
    ...publicConnection(connection),
    connectCode,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    instructions: `Open Telegram and send /connect ${connectCode} to ${botUsername() ? `@${botUsername()}` : "your bot"}.`
  });
});

export const getTelegramStatus = asyncHandler(async (req, res) => {
  const connection = await TelegramConnection.findOne({
    userId: req.user._id,
    status: { $in: ["connected", "pending"] }
  }).sort({ updatedAt: -1 });

  res.json(publicConnection(connection));
});

export const updateTelegramSettings = asyncHandler(async (req, res) => {
  const connection = await TelegramConnection.findOne({ userId: req.user._id, status: "connected" }).sort({ updatedAt: -1 });
  if (!connection) return res.status(404).json({ message: "Telegram is not connected." });
  ["dailySummaryEnabled", "appointmentBookedEnabled", "hotLeadEnabled", "callFailedEnabled"].forEach((field) => {
    if (req.body[field] !== undefined) connection[field] = Boolean(req.body[field]);
  });
  await connection.save();
  res.json(publicConnection(connection));
});

export const disconnectTelegram = asyncHandler(async (req, res) => {
  await TelegramConnection.updateMany(
    { userId: req.user._id, status: { $in: ["pending", "connected"] } },
    { $set: { status: "revoked", revokedAt: new Date() } }
  );

  res.json({ success: true, ...publicConnection(null) });
});
