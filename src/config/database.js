import mongoose from "mongoose";
import { logger } from "../utils/logger.js";

export async function connectDatabase() {
  try {
    const mongoUri = process.env.MONGODB_URI;

    if (!mongoUri) {
      throw new Error("MONGODB_URI não foi definida no arquivo .env");
    }

    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
    });

    logger.info("MongoDB conectado com sucesso.");

    // Configura índices TTL de retenção de dados se especificado
    await setupRetentionIndexes();
  } catch (error) {
    logger.error(`Erro ao conectar com MongoDB: ${error.message}`);
    if (process.env.NODE_ENV !== "test") {
      process.exit(1);
    }
    throw error;
  }
}

async function setupRetentionIndexes() {
  try {
    const eventDays = Number(process.env.EVENT_RETENTION_DAYS);
    if (eventDays && eventDays > 0) {
      const eventExpireSeconds = eventDays * 24 * 60 * 60;
      await mongoose.connection.collection("events").createIndex(
        { createdAt: 1 },
        { expireAfterSeconds: eventExpireSeconds, background: true }
      );
      logger.info(`Índice TTL configurado para Eventos: ${eventDays} dias.`);
    }

    const logDays = Number(process.env.LOG_RETENTION_DAYS);
    if (logDays && logDays > 0) {
      const logExpireSeconds = logDays * 24 * 60 * 60;
      await mongoose.connection.collection("eventlogs").createIndex(
        { createdAt: 1 },
        { expireAfterSeconds: logExpireSeconds, background: true }
      );
      logger.info(`Índice TTL configurado para EventLogs: ${logDays} dias.`);
    }
  } catch (err) {
    logger.warn(`Não foi possível aplicar índices de retenção TTL: ${err.message}`);
  }
}

export async function closeDatabase() {
  try {
    await mongoose.connection.close();
    logger.info("Conexão MongoDB encerrada com sucesso.");
  } catch (error) {
    logger.error(`Erro ao encerrar conexão MongoDB: ${error.message}`);
  }
}