import { Redis } from "ioredis";
import { logger } from "../utils/logger.js";

let redisClient = null;
let isRedisReady = false;

export function getRedisClient() {
  if (redisClient) {
    return redisClient;
  }

  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    logger.info("REDIS_URL não configurada. A fila funcionará em modo in-memory / direct async.");
    return null;
  }

  try {
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy(times) {
        if (times > 5) {
          logger.warn("Redis retry limit reached. Continuing with in-memory queue fallback.");
          return null; // Stop retrying
        }
        return Math.min(times * 500, 2000);
      },
    });

    redisClient.on("connect", () => {
      logger.info("Redis connecting...");
    });

    redisClient.on("ready", () => {
      isRedisReady = true;
      logger.info("Redis connected and ready.");
    });

    redisClient.on("error", (err) => {
      isRedisReady = false;
      logger.warn(`Redis connection error: ${err.message}`);
    });

    redisClient.on("close", () => {
      isRedisReady = false;
    });

    return redisClient;
  } catch (error) {
    logger.warn(`Falha ao inicializar cliente Redis: ${error.message}`);
    return null;
  }
}

export function checkRedisHealth() {
  return isRedisReady;
}

export async function closeRedis() {
  if (redisClient) {
    try {
      await redisClient.quit();
      logger.info("Conexão Redis encerrada.");
    } catch {
      redisClient.disconnect();
    }
  }
}
