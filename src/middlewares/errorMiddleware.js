import { AppError } from "../utils/AppError.js";
import { ERROR_CODES } from "../constants/index.js";
import { logger } from "../utils/logger.js";

export function errorMiddleware(error, req, res, _next) {
  // Trata erro de JSON parsing inválido no body
  if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    return res.status(400).json({
      success: false,
      error: {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "JSON malformado no corpo da requisição.",
      },
    });
  }

  // Trata erro de payload too large
  if (error.type === "entity.too.large") {
    return res.status(413).json({
      success: false,
      error: {
        code: "PAYLOAD_TOO_LARGE",
        message: "O corpo da requisição excede o tamanho máximo permitido.",
      },
    });
  }

  // Trata CastError do Mongoose (ex: ObjectId inválido)
  if (error.name === "CastError") {
    return res.status(400).json({
      success: false,
      error: {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: `Formato de identificador inválido para o campo '${error.path}'.`,
      },
    });
  }

  // Trata erro de chave duplicada no MongoDB (E11000)
  if (error.code === 11000) {
    const isIdempotency = Object.keys(error.keyPattern || {}).includes("idempotencyKey");
    return res.status(409).json({
      success: false,
      error: {
        code: isIdempotency ? ERROR_CODES.IDEMPOTENCY_CONFLICT : ERROR_CODES.VALIDATION_ERROR,
        message: isIdempotency
          ? "Conflito de Idempotência: Já existe um evento com esta idempotencyKey para esta integração."
          : "Registro duplicado encontrado.",
      },
    });
  }

  // Trata ValidationError do Mongoose
  if (error.name === "ValidationError") {
    const details = Object.values(error.errors).map((err) => ({
      field: err.path,
      message: err.message,
    }));

    return res.status(400).json({
      success: false,
      error: {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Erro de validação nos dados fornecidos.",
        details,
      },
    });
  }

  // Trata AppError operacional conhecido
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      success: false,
      error: {
        code: error.errorCode || "BAD_REQUEST",
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    });
  }

  // Erro não tratado (500)
  logger.error("Erro interno não tratado:", {
    error: error.message,
    stack: error.stack,
    requestId: req.requestId,
    correlationId: req.correlationId,
  });

  const isProd = process.env.NODE_ENV === "production";
  return res.status(500).json({
    success: false,
    error: {
      code: ERROR_CODES.INTERNAL_ERROR,
      message: isProd ? "Ocorreu um erro interno no servidor." : error.message,
      ...(!isProd && error.stack ? { stack: error.stack } : {}),
    },
  });
}