import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";

export const securityHeaders = helmet();

export const corsMiddleware = cors({
  origin: process.env.CORS_ORIGIN || "*",
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-API-Key",
    "X-Admin-Key",
    "X-Request-Id",
    "X-Correlation-Id",
    "X-Idempotency-Key",
    "Idempotency-Key",
    "X-Signature",
    "X-Signature-256",
    "X-Hub-Signature-256",
  ],
});

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: process.env.RATE_LIMIT_MAX ? Number(process.env.RATE_LIMIT_MAX) : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === "test" || req.path === "/health" || req.path === "/ready",
  message: {
    success: false,
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Limite de requisições excedido. Tente novamente mais tarde.",
    },
  },
});
