import { describe, expect, it, beforeAll } from "vitest";

beforeAll(() => {
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = "vitest-secret-for-jarvis-vault-tests";
  }
});

describe("vault encryption", () => {
  it("roundtrips a secret value", async () => {
    const { encryptSecret, decryptSecret } = await import("./_core/crypto");
    const plaintext = "tw_pk_live_1234567890ABCDEF";
    const cipher = encryptSecret(plaintext);
    expect(cipher).not.toContain(plaintext);
    expect(cipher.split(":")).toHaveLength(3);
    expect(decryptSecret(cipher)).toBe(plaintext);
  });

  it("produces a different ciphertext per encryption (random IV)", async () => {
    const { encryptSecret } = await import("./_core/crypto");
    const a = encryptSecret("same-value");
    const b = encryptSecret("same-value");
    expect(a).not.toBe(b);
  });

  it("masks revealing values", async () => {
    const { maskSecret } = await import("./_core/crypto");
    const masked = maskSecret("abcdef1234567890");
    expect(masked.startsWith("abc")).toBe(true);
    expect(masked.endsWith("890")).toBe(true);
    expect(masked.includes("•")).toBe(true);
  });
});
