import { describe, expect, it } from "vitest";

import { decryptToken, encryptToken } from "@/lib/google-calendar/token-crypto";

const key = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");

describe("token crypto", () => {
  it("decrypts an encrypted token", () => {
    const encrypted = encryptToken("secret-token", key);
    expect(decryptToken(encrypted, key)).toBe("secret-token");
  });

  it("uses a different iv for each encryption", () => {
    const first = encryptToken("secret-token", key);
    const second = encryptToken("secret-token", key);
    expect(first).not.toBe(second);
  });

  it("throws when the key is missing", () => {
    expect(() => encryptToken("secret-token", "")).toThrow("CALENDAR_TOKEN_ENCRYPTION_KEY is not set");
  });
});
