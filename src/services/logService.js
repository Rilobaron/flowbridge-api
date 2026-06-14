import EventLog from "../models/EventLog.js";

export async function createLog({
  eventId,
  level = "info",
  step,
  message,
  attempt = 0,
  metadata = {},
}) {
  return EventLog.create({
    eventId,
    level,
    step,
    message,
    attempt,
    metadata,
  });
}