import EventLog from "../models/EventLog.js";

export async function listEventLogs(req, res) {
  const { eventId, id } = req.params;
  const targetId = eventId || id;

  const logs = await EventLog.find({ eventId: targetId }).sort({ createdAt: 1 });

  return res.status(200).json({
    success: true,
    count: logs.length,
    data: logs,
  });
}

export async function listAllLogs(req, res) {
  const { page = 1, limit = 20, level, step, eventId, integrationId } = req.query;

  const filters = {};
  if (level) filters.level = level;
  if (step) filters.step = step;
  if (eventId) filters.eventId = eventId;
  if (integrationId) filters.integrationId = integrationId;

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
  const skip = (pageNum - 1) * limitNum;

  const [logs, total] = await Promise.all([
    EventLog.find(filters).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
    EventLog.countDocuments(filters),
  ]);

  return res.status(200).json({
    success: true,
    data: logs,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    },
    filters,
  });
}