import mongoose from "mongoose";
import { checkRedisHealth } from "../config/redis.js";

export function healthCheck(req, res) {
  return res.status(200).json({
    status: "ok",
    message: "FlowBridge API is healthy",
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
}

export function readinessCheck(req, res) {
  const mongoStatus = mongoose.connection.readyState === 1 ? "connected" : "disconnected";
  const redisConfigured = Boolean(process.env.REDIS_URL);
  const redisStatus = redisConfigured
    ? checkRedisHealth()
      ? "connected"
      : "disconnected"
    : "not_configured";

  const isReady = mongoStatus === "connected";

  const statusCode = isReady ? 200 : 503;

  return res.status(statusCode).json({
    status: isReady ? "ready" : "not_ready",
    timestamp: new Date().toISOString(),
    services: {
      mongodb: mongoStatus,
      redis: redisStatus,
    },
  });
}
