import { AppError } from "../utils/AppError.js";
import { ERROR_CODES } from "../constants/index.js";

export function validate(schema, source = "body") {
  return (req, res, next) => {
    try {
      const dataToValidate = req[source] || {};
      const parsed = schema.parse(dataToValidate);

      if (source === "query" || source === "params") {
        Object.assign(req[source], parsed);
      } else {
        req[source] = parsed;
      }

      next();
    } catch (error) {
      if (error.errors) {
        const formattedErrors = error.errors.map((err) => ({
          field: err.path.join("."),
          message: err.message,
        }));
        return next(
          new AppError(
            `Erro de validação: ${formattedErrors.map((e) => e.message).join(", ")}`,
            400,
            ERROR_CODES.VALIDATION_ERROR,
            formattedErrors
          )
        );
      }
      return next(error);
    }
  };
}
