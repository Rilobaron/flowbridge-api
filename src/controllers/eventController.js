import Event from "../models/Event.js";
import Delivery from "../models/Delivery.js";
import DeliveryAttempt from "../models/DeliveryAttempt.js";
import { addEventJob } from "../queues/eventQueue.js";
import { createLog } from "../services/logService.js";
import { AppError } from "../utils/AppError.js";
import { EVENT_STATUS, LOG_LEVELS, ERROR_CODES } from "../constants/index.js";

export async function listEvents(req, res) {
  const { status, source, eventType, integrationId, page = 1, limit = 10 } = req.query;

  const filters = {};

  if (status) {
    filters.status = status;
  }

  if (source) {
    filters.source = source;
  }

  if (eventType) {
    filters.eventType = eventType;
  }

  if (integrationId) {
    filters.integrationId = integrationId;
  }

  const pageNumber = Math.max(1, Number(page) || 1);
  const limitNumber = Math.min(100, Math.max(1, Number(limit) || 10)); // Limite máx 100
  const skip = (pageNumber - 1) * limitNumber;

  const [events, total] = await Promise.all([
    Event.find(filters).sort({ createdAt: -1 }).skip(skip).limit(limitNumber),
    Event.countDocuments(filters),
  ]);

  return res.status(200).json({
    success: true,
    data: events,
    pagination: {
      total,
      page: pageNumber,
      limit: limitNumber,
      totalPages: Math.ceil(total / limitNumber),
    },
    filters,
  });
}

export async function getEventStats(req, res) {
  const [total, byStatus, bySource, byEventType] = await Promise.all([
    Event.countDocuments(),

    Event.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
      {
        $sort: { count: -1 },
      },
    ]),

    Event.aggregate([
      {
        $group: {
          _id: "$source",
          count: { $sum: 1 },
        },
      },
      {
        $sort: { count: -1 },
      },
    ]),

    Event.aggregate([
      {
        $group: {
          _id: "$eventType",
          count: { $sum: 1 },
        },
      },
      {
        $sort: { count: -1 },
      },
    ]),
  ]);

  const statusSummary = byStatus.reduce((acc, item) => {
    acc[item._id] = item.count;
    return acc;
  }, {});

  const successCount = statusSummary.success || 0;
  const failedCount = statusSummary.failed || 0;
  const deadLetterCount = statusSummary.dead_letter || 0;
  const retryingCount = statusSummary.retrying || 0;
  const processingCount = statusSummary.processing || 0;
  const queuedCount = statusSummary.queued || 0;
  const receivedCount = statusSummary.received || 0;

  const successRate =
    total > 0 ? Number(((successCount / total) * 100).toFixed(2)) : 0;

  return res.status(200).json({
    success: true,
    data: {
      total,
      successRate,
      status: {
        received: receivedCount,
        queued: queuedCount,
        processing: processingCount,
        retrying: retryingCount,
        success: successCount,
        failed: failedCount,
        dead_letter: deadLetterCount,
      },
      sources: bySource.map((item) => ({
        source: item._id,
        count: item.count,
      })),
      eventTypes: byEventType.map((item) => ({
        eventType: item._id,
        count: item.count,
      })),
    },
  });
}

export async function getEventById(req, res) {
  const { eventId, id } = req.params;
  const targetId = eventId || id;

  const event = await Event.findById(targetId).populate("integrationId", "name slug destination enabled");

  if (!event) {
    throw new AppError("Evento não encontrado.", 404, ERROR_CODES.EVENT_NOT_FOUND);
  }

  // Busca deliveries e tentativas associadas
  const deliveries = await Delivery.find({ eventId: event._id });
  const attempts = await DeliveryAttempt.find({ eventId: event._id }).sort({ createdAt: -1 });

  return res.status(200).json({
    success: true,
    data: {
      ...event.toObject(),
      deliveries,
      deliveryAttempts: attempts,
    },
  });
}

export async function retryEvent(req, res) {
  const { eventId, id } = req.params;
  const targetId = eventId || id;
  const { simulateFailure } = req.body || {};

  const event = await Event.findById(targetId);

  if (!event) {
    throw new AppError("Evento não encontrado.", 404, ERROR_CODES.EVENT_NOT_FOUND);
  }

  if (event.status === EVENT_STATUS.PROCESSING) {
    throw new AppError(
      "O evento já está sendo processado no momento.",
      409,
      ERROR_CODES.VALIDATION_ERROR
    );
  }

  if (typeof simulateFailure === "boolean" && event.payload) {
    event.payload = {
      ...event.payload,
      simulateFailure,
    };
  }

  // Reseta status para queued e zera attempts para novo ciclo manual
  const previousStatus = event.status;
  event.status = EVENT_STATUS.QUEUED;
  await event.save();

  await createLog({
    eventId: event._id,
    integrationId: event.integrationId,
    correlationId: event.correlationId,
    level: LOG_LEVELS.INFO,
    step: "manual_retry_requested",
    message: "Reprocessamento manual do evento solicitado",
    metadata: {
      previousStatus,
      simulateFailure: typeof simulateFailure === "boolean" ? simulateFailure : undefined,
    },
  });

  // Enfileira de forma assíncrona
  await addEventJob({ eventId: event._id });

  return res.status(200).json({
    success: true,
    message: "Evento reenfileirado para reprocessamento manual.",
    data: {
      eventId: event._id,
      status: EVENT_STATUS.QUEUED,
    },
  });
}