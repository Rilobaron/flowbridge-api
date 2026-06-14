import Event from "../models/Event.js";
import { processEvent } from "../services/eventProcessorService.js";
import { createLog } from "../services/logService.js";
import { AppError } from "../utils/AppError.js";

export async function listEvents(req, res) {
  const { status, source, eventType, page = 1, limit = 10 } = req.query;

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

  const pageNumber = Number(page);
  const limitNumber = Number(limit);
  const skip = (pageNumber - 1) * limitNumber;

  const [events, total] = await Promise.all([
    Event.find(filters).sort({ createdAt: -1 }).skip(skip).limit(limitNumber),
    Event.countDocuments(filters),
  ]);

  return res.status(200).json({
    success: true,
    count: events.length,
    total,
    page: pageNumber,
    limit: limitNumber,
    totalPages: Math.ceil(total / limitNumber),
    filters,
    data: events,
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
  const processingCount = statusSummary.processing || 0;
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
        processing: processingCount,
        success: successCount,
        failed: failedCount,
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
  const { eventId } = req.params;

  const event = await Event.findById(eventId);

  if (!event) {
    throw new AppError("Event not found", 404);
  }

  return res.status(200).json({
    success: true,
    data: event,
  });
}

export async function retryEvent(req, res) {
  const { eventId } = req.params;
  const { simulateFailure } = req.body || {};

  const event = await Event.findById(eventId);

  if (!event) {
    throw new AppError("Event not found", 404);
  }

  if (event.status === "processing") {
    throw new AppError("Event is already processing", 409);
  }

  if (typeof simulateFailure === "boolean") {
    event.payload = {
      ...event.payload,
      simulateFailure,
    };

    await event.save();
  }

  await createLog({
    eventId: event._id,
    level: "info",
    step: "manual_retry_requested",
    message: "Manual retry requested",
    attempt: event.attempts,
    metadata: {
      previousStatus: event.status,
      simulateFailure:
        typeof simulateFailure === "boolean" ? simulateFailure : undefined,
    },
  });

  const processedEvent = await processEvent(event._id);

  return res.status(200).json({
    success: true,
    message: "Event retried successfully",
    data: processedEvent,
  });
}