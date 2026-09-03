import { Worker } from "bullmq";
import { getRedisClient } from "../config/redis.js";
import { processEvent } from "../services/eventProcessorService.js";
import { logger } from "../utils/logger.js";

const QUEUE_NAME = "flowbridge-events";

let eventWorker = null;

export function initEventWorker() {
  const redis = getRedisClient();
  if (!redis) {
    logger.info("Worker BullMQ não inicializado (Redis não configurado). Modo in-memory ativo.");
    return null;
  }

  try {
    eventWorker = new Worker(
      QUEUE_NAME,
      async (job) => {
        const { eventId } = job.data;
        logger.info(`Worker iniciando processamento do job ${job.id} (eventId: ${eventId})`);
        return await processEvent(eventId);
      },
      {
        connection: redis,
        concurrency: Number(process.env.WORKER_CONCURRENCY) || 5,
      }
    );

    eventWorker.on("completed", (job) => {
      logger.info(`Job ${job.id} concluído com sucesso.`);
    });

    eventWorker.on("failed", (job, err) => {
      logger.error(`Job ${job.id} falhou: ${err.message}`);
    });

    logger.info("BullMQ Event Worker iniciado.");
    return eventWorker;
  } catch (error) {
    logger.warn(`Falha ao iniciar BullMQ Worker: ${error.message}`);
    return null;
  }
}

export async function closeEventWorker() {
  if (eventWorker) {
    try {
      await eventWorker.close();
      logger.info("BullMQ Event Worker finalizado.");
    } catch (e) {
      logger.warn(`Erro ao finalizar worker: ${e.message}`);
    }
  }
}
