import crypto from "crypto";
import { logger } from "../utils/logger.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits recomendado para GCM
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey() {
  const envKey = process.env.ENCRYPTION_KEY;
  if (!envKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("ENCRYPTION_KEY é obrigatória no ambiente de produção.");
    }
    // Chave padrão determinística para ambiente de desenvolvimento/testes
    return crypto.createHash("sha256").update("flowbridge_default_dev_key_2026").digest();
  }
  return crypto.createHash("sha256").update(envKey).digest();
}

/**
 * Criptografa uma string usando AES-256-GCM.
 * Retorna no formato iv:authTag:encryptedContent (hex).
 */
export function encrypt(plainText) {
  if (!plainText || typeof plainText !== "string") {
    return plainText;
  }

  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });

    let encrypted = cipher.update(plainText, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");

    return `${iv.toString("hex")}:${authTag}:${encrypted}`;
  } catch (error) {
    logger.error("Erro ao criptografar dados:", { error: error.message });
    throw error;
  }
}

/**
 * Descriptografa uma string criptografada pelo encrypt().
 * Se a string não estiver no formato criptografado, retorna o texto puro (para compatibilidade).
 */
export function decrypt(encryptedText) {
  if (!encryptedText || typeof encryptedText !== "string") {
    return encryptedText;
  }

  // Verifica formato iv:authTag:encrypted
  const parts = encryptedText.split(":");
  if (parts.length !== 3) {
    // Não está no formato criptografado
    return encryptedText;
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  if (ivHex.length !== IV_LENGTH * 2 || authTagHex.length !== AUTH_TAG_LENGTH * 2) {
    return encryptedText;
  }

  try {
    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    logger.error("Erro ao descriptografar dados:", { error: error.message });
    throw new Error("Falha ao descriptografar credencial.");
  }
}

/**
 * Retorna uma versão mascarada de um segredo/token para nunca expor em respostas da API.
 */
export function maskSecret(secret) {
  if (!secret || typeof secret !== "string") {
    return "********";
  }
  if (secret.length <= 4) {
    return "********";
  }
  return "********";
}
