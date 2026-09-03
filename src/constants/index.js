export const EVENT_STATUS = {
  RECEIVED: "received",
  QUEUED: "queued",
  PROCESSING: "processing",
  RETRYING: "retrying",
  SUCCESS: "success",
  FAILED: "failed",
  DEAD_LETTER: "dead_letter",
};

export const DELIVERY_STATUS = {
  PENDING: "pending",
  PROCESSING: "processing",
  RETRYING: "retrying",
  SUCCESS: "success",
  FAILED: "failed",
  DEAD_LETTER: "dead_letter",
};

export const INBOUND_AUTH_TYPE = {
  NONE: "none",
  API_KEY: "api_key",
  BEARER: "bearer",
  HMAC: "hmac",
};

export const OUTBOUND_AUTH_TYPE = {
  NONE: "none",
  BEARER: "bearer",
  API_KEY: "apiKey",
  BASIC: "basic",
  OAUTH2: "oauth2",
};

export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

export const RETRYABLE_HTTP_STATUSES = [408, 425, 429, 500, 502, 503, 504];

export const NON_RETRYABLE_HTTP_STATUSES = [400, 401, 403, 404, 405, 422];

export const LOG_LEVELS = {
  INFO: "info",
  SUCCESS: "success",
  WARNING: "warning",
  ERROR: "error",
  DEBUG: "debug",
};

export const ERROR_CODES = {
  INTEGRATION_NOT_FOUND: "INTEGRATION_NOT_FOUND",
  INTEGRATION_DISABLED: "INTEGRATION_DISABLED",
  EVENT_NOT_FOUND: "EVENT_NOT_FOUND",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  IDEMPOTENCY_CONFLICT: "IDEMPOTENCY_CONFLICT",
  SSRF_BLOCKED: "SSRF_BLOCKED",
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  OAUTH_ERROR: "OAUTH_ERROR",
  INTERNAL_ERROR: "INTERNAL_ERROR",
};
