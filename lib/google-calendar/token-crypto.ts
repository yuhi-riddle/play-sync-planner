import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

function getKey(keyBase64 = process.env.CALENDAR_TOKEN_ENCRYPTION_KEY ?? "") {
  if (!keyBase64) {
    throw new Error("CALENDAR_TOKEN_ENCRYPTION_KEY is not set");
  }

  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== 32) {
    throw new Error("CALENDAR_TOKEN_ENCRYPTION_KEY must decode to 32 bytes");
  }

  return key;
}

export function encryptToken(plainText: string, keyBase64?: string): string {
  const key = getKey(keyBase64);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("base64")}:${Buffer.concat([encrypted, authTag]).toString("base64")}`;
}

export function decryptToken(encryptedValue: string, keyBase64?: string): string {
  const key = getKey(keyBase64);
  const [ivBase64, payloadBase64] = encryptedValue.split(":");
  if (!ivBase64 || !payloadBase64) {
    throw new Error("Encrypted token format is invalid");
  }

  const iv = Buffer.from(ivBase64, "base64");
  const payload = Buffer.from(payloadBase64, "base64");
  const encrypted = payload.subarray(0, -16);
  const authTag = payload.subarray(-16);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
