import EventLog from "../models/EventLog.js";

export async function listEventLogs(req, res) {
  const { eventId } = req.params;

  const logs = await EventLog.find({ eventId }).sort({ createdAt: 1 });

  return res.status(200).json({
    success: true,
    count: logs.length,
    data: logs,
  });
}