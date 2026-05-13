import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { ENV } from "./env";

/**
 * AES-256-GCM encryption helper for the API key vault.
 * The key is derived from JWT_SECRET via SHA-256, never stored or transmitted.
 */

function getKey(): Buffer {
  if (!ENV.cookieSecret) {
    throw new Error("JWT_SECRET is not set; vault encryption is disabled");
  }
  return createHash("sha256").update(ENV.cookieSecret).digest();
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const key = getKey();
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 3) throw new Error("Malformed encrypted payload");
  const [ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const key = getKey();
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return dec.toString("utf8");
}

export function maskSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 8) return "•".repeat(value.length);
  return `${value.slice(0, 3)}${"•".repeat(Math.max(4, value.length - 6))}${value.slice(-3)}`;
}
