import crypto from "crypto";
import { ApiError } from "../utils/apiError.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getKey() {
  const raw = process.env.EMAIL_CREDENTIAL_ENCRYPTION_KEY || process.env.SECRET_ENCRYPTION_KEY || "";
  const value = String(raw).trim();
  if (value.length < 32) {
    throw new ApiError(500, "EMAIL_CREDENTIAL_ENCRYPTION_KEY must be at least 32 bytes.");
  }
  return crypto.createHash("sha256").update(value).digest();
}

export function encryptCredential(value) {
  const plain = String(value || "");
  if (!plain) return "";
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":");
}

export function decryptCredential(encryptedValue) {
  const value = String(encryptedValue || "");
  if (!value) return "";
  const [version, ivRaw, tagRaw, encryptedRaw] = value.split(":");
  if (version !== "v1" || !ivRaw || !tagRaw || !encryptedRaw) throw new ApiError(500, "Stored credential cannot be decrypted.");
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivRaw, "base64"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64")),
    decipher.final()
  ]).toString("utf8");
}

export function maskCredential(value) {
  const text = String(value || "");
  if (!text) return "";
  if (text.startsWith("xkeysib-")) {
    const suffix = text.slice(-5);
    return `xkeysib-${"•".repeat(10)}${suffix}`;
  }
  return "•".repeat(12);
}
