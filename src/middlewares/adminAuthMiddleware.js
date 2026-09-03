import crypto from "crypto";
import { AppError } from "../utils/AppError.js";
import { ERROR_CODES } from "../constants/index.js";

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

export function adminAuthMiddleware(req, res, next) {
  const adminApiKey = process.env.ADMIN_API_KEY;

  if (!adminApiKey) {
    if (process.env.NODE_ENV === "production") {
      return next(
        new AppError(
          "Configuração de segurança incompleta: ADMIN_API_KEY não definida.",
          500,
          ERROR_CODES.INTERNAL_ERROR
        )
      );
    }
    return next();
  }

  const apiKeyHeader = req.headers["x-api-key"] || req.headers["x-admin-key"];
  const authHeader = req.headers["authorization"];

  let providedKey = null;

  if (apiKeyHeader) {
    providedKey = apiKeyHeader;
  } else if (authHeader && authHeader.startsWith("Bearer ")) {
    providedKey = authHeader.slice(7).trim();
  }

  if (!providedKey) {
    return next(
      new AppError(
        "Acesso não autorizado. Chave de API administrativa obrigatória (header 'X-API-Key').",
        401,
        ERROR_CODES.UNAUTHORIZED
      )
    );
  }

  if (!safeStringCompare(adminApiKey, String(providedKey))) {
    return next(
      new AppError("Chave de API administrativa inválida.", 403, ERROR_CODES.FORBIDDEN)
    );
  }

  next();
}
