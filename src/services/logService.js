import EventLog from "../models/EventLog.js";
import { logger } from "../utils/logger.js";

export async function createLog({
  eventId,
  integrationId = null,
  deliveryId = null,
  correlationId = null,
  requestId = null,
  level = "info",
  step,
  message,
  attempt = 0,
  metadata = {},
}) {
  try {
    // Grava log estruturado no Winston
    const winstonMethod =
      level === "error"
        ? logger.error.bind(logger)
        : level === "warning"
        ? logger.warn.bind(logger)
        : logger.info.bind(logger);

    winstonMethod(message, {
      eventId: eventId?.toString(),
      integrationId: integrationId?.toString(),
      deliveryId: deliveryId?.toString(),
      correlationId,
      step,
      attempt,
      metadata,
    });

    // Grava no MongoDB EventLog
    return await EventLog.create({
      eventId,
      integrationId,
      deliveryId,
      correlationId,
      requestId,
      level,
      step,
      message,
      attempt,
      metadata,
    });
  } catch (error) {
    logger.error("Falha ao salvar EventLog:", { error: error.message });
    return null;
  }
}