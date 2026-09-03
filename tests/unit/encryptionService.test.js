import { describe, it, expect } from "vitest";
import { encrypt, decrypt, maskSecret } from "../../src/services/encryptionService.js";

describe("encryptionService (Unit Tests)", () => {
  it("deve criptografar e descriptografar com sucesso usando AES-256-GCM", () => {
    const plainSecret = "minha_chave_super_secreta_123456";
    const encrypted = encrypt(plainSecret);

    expect(encrypted).toBeDefined();
    expect(encrypted).not.toBe(plainSecret);
    expect(encrypted.split(":")).toHaveLength(3); // iv:authTag:encrypted

    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plainSecret);
  });

  it("deve lidar graciosamente com valores nulos ou vazios", () => {
    expect(encrypt(null)).toBeNull();
    expect(decrypt(null)).toBeNull();
    expect(encrypt("")).toBe("");
  });

  it("deve mascarar segredos para respostas de API", () => {
    expect(maskSecret("secret_token_123")).toBe("********");
    expect(maskSecret(null)).toBe("********");
  });
});
