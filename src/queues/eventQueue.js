import { Queue } from "bullmq";
import { getRedisClient } from "../config/redis.js";
import { logger } from "../utils/logger.js";
import { processEvent } from "../services/eventProcessorService.js";

const QUEUE_NAME = "flowbridge-events";

let eventQueue = null;

export function getEventQueue() {
  if (eventQueue) {
    return eventQueue;
  }

  // Em ambiente de teste isolado, não conecta ao BullMQ
  if (process.env.NODE_ENV === "test") {
    return null;
  }

  const redis = getRedisClient();
  if (redis) {
    try {
      eventQueue = new Queue(QUEUE_NAME, {
        connection: redis,
        defaultJobOptions: {
          removeOnComplete: 1000,
          removeOnFail: 5000,
        },
      });
      logger.info("BullMQ Event Queue inicializada com Redis.");
    } catch (err) {
      logger.warn(`Falha ao iniciar BullMQ Queue: ${err.message}. Usando in-memory fallback.`);
    }
  }

  return eventQueue;
}

/**
 * Adiciona um evento para processamento assíncrono na fila.
 */
export async function addEventJob({ eventId, attempt = 1, delayMs = 0 }) {
  const queue = getEventQueue();

  if (queue) {
    try {
      const job = await queue.add(
        "process-event",
        { eventId: eventId.toString(), attempt },
        {
          delay: delayMs,
          jobId: delayMs > 0 ? `${eventId}-${attempt}-${Date.now()}` : `${eventId}-${attempt}`,
        }
      );
      logger.info(`Job ${job.id} enfileirado no BullMQ para o evento ${eventId} (delay: ${delayMs}ms).`);
      return { type: "bullmq", jobId: job.id };
    } catch (error) {
      logger.warn(`Erro ao enfileirar no BullMQ: ${error.message}. Processando via in-memory fallback.`);
    }
  }

  // Em modo de testes automáticos do webhook, não dispara execução em background não sincronizada
  if (process.env.NODE_ENV === "test" && process.env.AUTO_PROCESS_IN_TESTS !== "true") {
    return { type: "test-queued", status: "queued", eventId };
  }

  // In-Memory / Direct Async Fallback
  if (delayMs > 0) {
    setTimeout(() => {
      processEvent(eventId).catch((err) => {
        logger.error(`Erro no processamento in-memory do evento ${eventId}:`, { error: err.message });
      });
    }, delayMs);
  } else {
    setImmediate(() => {
      processEvent(eventId).catch((err) => {
        logger.error(`Erro no processamento in-memory do evento ${eventId}:`, { error: err.message });
      });
    });
  }

  return { type: "in-memory", status: "scheduled", delayMs };
}

export async function closeEventQueue() {
  if (eventQueue) {
    try {
      await eventQueue.close();
      logger.info("BullMQ Event Queue fechada.");
    } catch (e) {
      logger.warn(`Erro ao fechar fila: ${e.message}`);
    }
  }
}
