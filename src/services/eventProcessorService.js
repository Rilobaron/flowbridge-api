import Event from "../models/Event.js";
import { sendToExternalApi } from "./externalApiService.js";
import { createLog } from "./logService.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function transformEvent(event) {
  return {
    externalId: event._id.toString(),
    source: event.source,
    eventType: event.eventType,
    lead: {
      name: event.payload.name,
      email: event.payload.email,
      phone: event.payload.phone,
      origin: event.payload.origin || "unknown",
    },
    simulateFailure: event.payload.simulateFailure || false,
    receivedAt: event.createdAt,
    processedBy: "flowbridge-api",
  };
}

export async function processEvent(eventId) {
  const event = await Event.findById(eventId);

  if (!event) {
    throw new Error("Evento não encontrado");
  }

  const maxRetryAttempts = Number(process.env.MAX_RETRY_ATTEMPTS) || 3;
  const retryDelayMs = Number(process.env.RETRY_DELAY_MS) || 1000;

event.status = "processing";
event.attempts = 0;
event.lastError = null;
event.processedAt = null;

await event.save();

  await createLog({
    eventId: event._id,
    level: "info",
    step: "processing_started",
    message: "Event processing started",
    attempt: event.attempts,
  });

  const transformedData = transformEvent(event);

  await createLog({
    eventId: event._id,
    level: "info",
    step: "data_transformed",
    message: "Event data transformed successfully",
    attempt: event.attempts,
    metadata: transformedData,
  });

  let lastError = null;

  for (let attempt = 1; attempt <= maxRetryAttempts; attempt++) {
    try {
      event.attempts = attempt;
      await event.save();

      await createLog({
        eventId: event._id,
        level: "info",
        step: "external_api_request",
        message: `Sending data to external API - attempt ${attempt}`,
        attempt,
      });

      const externalResponse = await sendToExternalApi(transformedData);

      await createLog({
        eventId: event._id,
        level: "success",
        step: "external_api_response",
        message: "External API responded successfully",
        attempt,
        metadata: externalResponse,
      });

      event.status = "success";
      event.processedAt = new Date();
      event.lastError = null;

      await event.save();

      await createLog({
        eventId: event._id,
        level: "success",
        step: "processing_finished",
        message: "Event processed successfully",
        attempt,
      });

      return event;
    } catch (error) {
      lastError = error;

      await createLog({
        eventId: event._id,
        level: "warning",
        step: "external_api_failed",
        message: `External API request failed on attempt ${attempt}`,
        attempt,
        metadata: {
          error: error.message,
        },
      });

      if (attempt < maxRetryAttempts) {
        await createLog({
          eventId: event._id,
          level: "info",
          step: "retry_scheduled",
          message: `Retry scheduled in ${retryDelayMs}ms`,
          attempt,
        });

        await sleep(retryDelayMs);
      }
    }
  }

  event.status = "failed";
  event.lastError = lastError?.message || "Unknown error";

  await event.save();

  await createLog({
    eventId: event._id,
    level: "error",
    step: "processing_failed",
    message: "Event processing failed after all retry attempts",
    attempt: event.attempts,
    metadata: {
      error: event.lastError,
      maxRetryAttempts,
    },
  });

  throw lastError;
}