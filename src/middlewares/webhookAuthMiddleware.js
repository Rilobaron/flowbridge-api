import crypto from "crypto";
import Integration from "../models/Integration.js";
import { AppError } from "../utils/AppError.js";
import { ERROR_CODES, INBOUND_AUTH_TYPE } from "../constants/index.js";

/**
 * Comparação segura de strings em tempo constante para evitar timing attacks
 */
function safeStringCompare(a, b) {
  if (!a || !b || typeof a !== "string" || typeof b !== "string") {
    return false;
  }
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Middleware para validar a autenticação do webhook de acordo com a Integration configurada.
 */
export async function webhookAuthMiddleware(req, res, next) {
  const { slug } = req.params;

  if (!slug) {
    return next(new AppError("Slug da integração não informado.", 400, ERROR_CODES.VALIDATION_ERROR));
  }

  // Busca a integração ativa
  const integration = await Integration.findOne({
    slug: slug.toLowerCase(),
    isDeleted: false,
  });

  if (!integration) {
    return next(
      new AppError(
        `Integração '${slug}' não encontrada.`,
        404,
        ERROR_CODES.INTEGRATION_NOT_FOUND
      )
    );
  }

  if (!integration.enabled) {
    return next(
      new AppError(
        `Integração '${slug}' está desativada.`,
        403,
        ERROR_CODES.INTEGRATION_DISABLED
      )
    );
  }

  // Anexa a integração ao request para uso nos controllers
  req.integration = integration;

  const authType = integration.source?.authenticationType || INBOUND_AUTH_TYPE.NONE;
  if (authType === INBOUND_AUTH_TYPE.NONE) {
    return next();
  }

  const credentials = integration.getDecryptedCredentials ? integration.getDecryptedCredentials() : {};
  const secret = credentials.sourceSecret || integration.source?.secret;

  if (!secret) {
    return next();
  }

  // 1. API KEY AUTH
  if (authType === INBOUND_AUTH_TYPE.API_KEY) {
    const customHeader = integration.source?.headerName;
    const providedKey =
      (customHeader ? req.headers[customHeader.toLowerCase()] : null) ||
      req.headers["x-api-key"] ||
      req.query?.apiKey ||
      req.query?.api_key;

    if (!providedKey) {
      return next(
        new AppError(
          "Autenticação por API Key obrigatória para este webhook.",
          401,
          ERROR_CODES.UNAUTHORIZED
        )
      );
    }

    if (!safeStringCompare(secret, String(providedKey))) {
      return next(
        new AppError("API Key fornecida é inválida.", 401, ERROR_CODES.UNAUTHORIZED)
      );
    }

    return next();
  }

  // 2. BEARER TOKEN AUTH
  if (authType === INBOUND_AUTH_TYPE.BEARER) {
    const authHeader = req.headers["authorization"];
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return next(
        new AppError(
          "Autenticação Bearer token obrigatória para este webhook.",
          401,
          ERROR_CODES.UNAUTHORIZED
        )
      );
    }

    const providedToken = authHeader.slice(7).trim();

    if (!safeStringCompare(secret, providedToken)) {
      return next(
        new AppError("Bearer token fornecido é inválido.", 401, ERROR_CODES.UNAUTHORIZED)
      );
    }

    return next();
  }

  // 3. HMAC SHA-256 SIGNATURE
  if (authType === INBOUND_AUTH_TYPE.HMAC) {
    const customHeader = integration.source?.headerName;
    const signatureHeader =
      (customHeader ? req.headers[customHeader.toLowerCase()] : null) ||
      req.headers["x-hub-signature-256"] ||
      req.headers["x-signature-256"] ||
      req.headers["x-signature"];

    if (!signatureHeader) {
      return next(
        new AppError(
          "Assinatura HMAC SHA-256 obrigatória (header X-Signature ou X-Hub-Signature-256).",
          401,
          ERROR_CODES.UNAUTHORIZED
        )
      );
    }

    const cleanSignature = signatureHeader.startsWith("sha256=")
      ? signatureHeader.slice(7)
      : signatureHeader;

    const rawBody = req.rawBody ? req.rawBody.toString("utf8") : JSON.stringify(req.body || {});
    const computedSignature = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");

    if (!safeStringCompare(computedSignature.toLowerCase(), cleanSignature.toLowerCase())) {
      return next(
        new AppError("Assinatura HMAC inválida.", 401, ERROR_CODES.UNAUTHORIZED)
      );
    }

    return next();
  }

  next();
}
