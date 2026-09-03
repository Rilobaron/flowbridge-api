export class AppError extends Error {
  constructor(message, statusCode = 400, errorCode = "BAD_REQUEST", details = null) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}