import winston from "winston";

const SENSITIVE_KEYS = [
  "password",
  "token",
  "secret",
  "apikey",
  "api_key",
  "authorization",
  "x-api-key",
  "cookie",
];

function sanitizeObject(obj) {
  if (!obj || typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = SENSITIVE_KEYS.some((sensitive) =>
      lowerKey.includes(sensitive)
    );

    if (isSensitive && typeof value === "string") {
      sanitized[key] = "********";
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

const sanitizeFormat = winston.format((info) => {
  const { ...meta } = info;
  return sanitizeObject(meta);
});

const logLevel = process.env.LOG_LEVEL || "info";

export const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DDTHH:mm:ss.SSSZ" }),
    sanitizeFormat(),
    winston.format.json()
  ),
  defaultMeta: { service: "flowbridge-api" },
  transports: [
    new winston.transports.Console({
      format:
        process.env.NODE_ENV === "development"
          ? winston.format.combine(
              winston.format.colorize(),
              winston.format.printf((info) => {
                const { timestamp, level, message, eventId, correlationId, ...rest } =
                  info;
                const extra =
                  Object.keys(rest).length > 1
                    ? ` ${JSON.stringify(rest)}`
                    : "";
                const cid = correlationId ? ` [cid:${correlationId}]` : "";
                const eid = eventId ? ` [eid:${eventId}]` : "";
                return `${timestamp} ${level}:${cid}${eid} ${message}${extra}`;
              })
            )
          : winston.format.combine(
              winston.format.timestamp(),
              sanitizeFormat(),
              winston.format.json()
            ),
    }),
  ],
});
