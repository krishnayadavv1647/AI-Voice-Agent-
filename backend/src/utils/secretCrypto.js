import crypto from "crypto";

const PREFIX = "enc:v1:";

function getKey() {
  const source = process.env.TELEPHONY_SECRET_KEY || process.env.JWT_SECRET;
  if (!source) return null;
  return crypto.createHash("sha256").update(source).digest();
}

export function encryptSecret(value) {
  if (!value || String(value).startsWith(PREFIX)) return value;
  const key = getKey();
  if (!key) return value;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${PREFIX}${Buffer.concat([iv, tag, encrypted]).toString("base64")}`;
}

export function decryptSecret(value) {
  if (!value || !String(value).startsWith(PREFIX)) return value;
  const key = getKey();
  if (!key) return value;

  const raw = Buffer.from(String(value).slice(PREFIX.length), "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
