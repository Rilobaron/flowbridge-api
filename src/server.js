import dotenv from "dotenv";
import app from "./app.js";
import { connectDatabase, closeDatabase } from "./config/database.js";
import { initEventWorker, closeEventWorker } from "./workers/eventWorker.js";
import { closeEventQueue } from "./queues/eventQueue.js";
import { closeRedis } from "./config/redis.js";
import { logger } from "./utils/logger.js";

dotenv.config();

const PORT = process.env.PORT || 3000;
let server = null;

async function startServer() {
  try {
    await connectDatabase();

    // Inicializa workers de fila assíncrona
    initEventWorker();

    server = app.listen(PORT, () => {
      logger.info(`FlowBridge API rodando na porta ${PORT} [env: ${process.env.NODE_ENV || "development"}]`);
      logger.info(`Documentação interativa disponível em http://localhost:${PORT}/docs`);
    });
  } catch (error) {
    logger.error("Falha fatal na inicialização do servidor:", { error: error.message });
    process.exit(1);
  }
}

// Graceful Shutdown
let isShuttingDown = false;

async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`Recebido sinal ${signal}. Iniciando encerramento gracioso (Graceful Shutdown)...`);

  // Define um timer de segurança para forçar o encerramento se travar
  const forceExitTimeout = setTimeout(() => {
    logger.error("Tempo limite de encerramento excedido. Forçando saída.");
    process.exit(1);
  }, 10000);

  try {
    // 1. Para de receber novas conexões HTTP
    if (server) {
      await new Promise((resolve) => server.close(resolve));
      logger.info("Servidor HTTP fechado.");
    }

    // 2. Encerra workers e filas
    await closeEventWorker();
    await closeEventQueue();
    await closeRedis();

    // 3. Fecha banco de dados
    await closeDatabase();

    clearTimeout(forceExitTimeout);
    logger.info("Graceful shutdown concluído com sucesso. Tchau!");
    process.exit(0);
  } catch (error) {
    logger.error("Erro durante o graceful shutdown:", { error: error.message });
    clearTimeout(forceExitTimeout);
    process.exit(1);
  }
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

process.on("uncaughtException", (error) => {
  logger.error("Exceção não tratada (Uncaught Exception):", {
    error: error.message,
    stack: error.stack,
  });
  gracefulShutdown("uncaughtException");
});

process.on("unhandledRejection", (reason) => {
  logger.error("Promessa rejeitada não tratada (Unhandled Rejection):", {
    reason: reason instanceof Error ? reason.message : reason,
  });
});

startServer();