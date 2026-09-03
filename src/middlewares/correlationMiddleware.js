import crypto from "crypto";

export function correlationMiddleware(req, res, next) {
  const requestId = req.headers["x-request-id"] || crypto.randomUUID();
  const correlationId =
    req.headers["x-correlation-id"] ||
    req.headers["x-trace-id"] ||
    crypto.randomUUID();

  req.requestId = requestId;
  req.correlationId = correlationId;

  res.setHeader("X-Request-Id", requestId);
  res.setHeader("X-Correlation-Id", correlationId);

  next();
}
