import Event from "../models/Event.js";
import { processEvent } from "../services/eventProcessorService.js";
import { createLog } from "../services/logService.js";
import { AppError } from "../utils/AppError.js";

export async function receiveWebhook(req, res) {
  const { source, eventType, payload } = req.body;

  if (!source || !eventType || !payload) {
    throw new AppError("source, eventType and payload are required", 400);
  }

  const event = await Event.create({
    source,
    eventType,
    payload,
    status: "received",
  });

  await createLog({
    eventId: event._id,
    level: "info",
    step: "webhook_received",
    message: "Webhook received successfully",
    metadata: {
      source,
      eventType,
    },
  });

  const processedEvent = await processEvent(event._id);

  return res.status(201).json({
    success: true,
    message: "Webhook received and processed successfully",
    data: processedEvent,
  });
}