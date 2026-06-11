import crypto from "crypto";
import { ApiError } from "./apiError.js";

const PREFIX = "enc:v1:";

function getEncryptionKey() {
  const source = process.env.SECRET_ENCRYPTION_KEY?.trim();
  if (!source) {
    throw new ApiError(500, "SECRET_ENCRYPTION_KEY is missing. Dograh API keys cannot be saved without encryption.");
  }
  return crypto.createHash("sha256").update(source).digest();
}

export function encryptSecret(value) {
  if (!value) return "";
  const text = String(value);
  if (text.startsWith(PREFIX)) return text;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${PREFIX}${Buffer.concat([iv, tag, encrypted]).toString("base64")}`;
}

export function decryptSecret(value) {
  if (!value) return "";
  const text = String(value);
  if (!text.startsWith(PREFIX)) {
    throw new ApiError(500, "Stored Dograh API key is not encrypted. Please reconnect Dograh in Settings.");
  }

  const raw = Buffer.from(text.slice(PREFIX.length), "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", getEncryptionKey(), iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export function maskSecret(value) {
  if (!value) return "";
  const text = String(value);
  const suffix = text.slice(-4);
  if (text.length <= 8) return `****${suffix}`;
  const prefix = text.slice(0, Math.min(7, text.length - 4));
  return `${prefix}****${suffix}`;
}
