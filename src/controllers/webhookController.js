import crypto from "crypto";
import Event from "../models/Event.js";
import { createLog } from "../services/logService.js";
import { addEventJob } from "../queues/eventQueue.js";
import { EVENT_STATUS, LOG_LEVELS } from "../constants/index.js";
import { AppError } from "../utils/AppError.js";
import Integration from "../models/Integration.js";

/**
 * Extrai ou gera uma chave de idempotência para a requisição de webhook
 */
function extractIdempotencyKey(req) {
  const headerKey = req.headers["idempotency-key"] || req.headers["x-idempotency-key"];
  if (headerKey) return String(headerKey).trim();

  if (req.body && typeof req.body === "object") {
    if (req.body.idempotencyKey) return String(req.body.idempotencyKey).trim();
    if (req.body.id) return String(req.body.id).trim();
    if (req.body.event_id) return String(req.body.event_id).trim();
  }

  // Fallback: Gera hash SHA-256 do payload para garantir idempotência automática de payloads idênticos
  const payloadString = req.rawBody ? req.rawBody.toString() : JSON.stringify(req.body || {});
  return crypto.createHash("sha256").update(payloadString).digest("hex");
}

/**
 * Recebe webhook dinâmico por slug de integração (/api/v1/webhooks/:slug)
 */
export async function receiveDynamicWebhook(req, res) {
  const integration = req.integration; // Injetado pelo webhookAuthMiddleware

  if (!req.body || typeof req.body !== "object" || Object.keys(req.body).length === 0) {
    throw new AppError("Payload do webhook é obrigatório.", 400);
  }

  const idempotencyKey = extractIdempotencyKey(req);

  // 1. Verifica Idempotência
  if (idempotencyKey) {
    const existingEvent = await Event.findOne({
      integrationId: integration._id,
      idempotencyKey,
    });

    if (existingEvent) {
      return res.status(200).json({
        success: true,
        message: "Evento já recebido anteriormente (idempotente).",
        eventId: existingEvent._id,
        status: existingEvent.status,
      });
    }
  }

  const eventType =
    req.body.eventType ||
    req.body.event ||
    req.body.type ||
    req.headers["x-event-type"] ||
    "webhook.received";

  const externalId =
    req.body.id ||
    req.body.eventId ||
    req.body.event_id ||
    req.body.externalId ||
    null;

  // 2. Persiste o Evento no MongoDB com status inicial 'queued'
  const event = await Event.create({
    integrationId: integration._id,
    source: integration.slug,
    eventType: String(eventType),
    externalId: externalId ? String(externalId) : null,
    idempotencyKey,
    correlationId: req.correlationId,
    requestId: req.requestId,
    payload: req.body,
    status: EVENT_STATUS.QUEUED,
  });

  // 3. Registra log de recebimento
  await createLog({
    eventId: event._id,
    integrationId: integration._id,
    correlationId: req.correlationId,
    requestId: req.requestId,
    level: LOG_LEVELS.INFO,
    step: "webhook_received",
    message: `Webhook recebido com sucesso para a integração '${integration.slug}'`,
    metadata: {
      source: integration.slug,
      eventType,
      idempotencyKey,
    },
  });

  // 4. Enfileira o processamento assíncrono
  await addEventJob({ eventId: event._id });

  // 5. Responde imediatamente com HTTP 202 Accepted
  return res.status(202).json({
    success: true,
    message: "Webhook recebido e enfileirado para processamento.",
    eventId: event._id,
    status: EVENT_STATUS.QUEUED,
  });
}

/**
 * Receptor de webhook legado para retrocompatibilidade (/webhook)
 */
export async function receiveLegacyWebhook(req, res) {
  const { source, eventType, payload } = req.body || {};

  if (!source || !eventType || !payload) {
    throw new AppError("source, eventType e payload são obrigatórios.", 400);
  }

  // Tenta encontrar ou criar integração correspondente ao source
  let integration = await Integration.findOne({ slug: source.toLowerCase(), isDeleted: false });

  const event = await Event.create({
    integrationId: integration ? integration._id : null,
    source,
    eventType,
    payload,
    correlationId: req.correlationId,
    requestId: req.requestId,
    status: EVENT_STATUS.QUEUED,
  });

  await createLog({
    eventId: event._id,
    integrationId: integration ? integration._id : null,
    correlationId: req.correlationId,
    level: LOG_LEVELS.INFO,
    step: "webhook_received",
    message: "Webhook legado recebido com sucesso",
    metadata: { source, eventType },
  });

  // Enfileira de forma assíncrona
  await addEventJob({ eventId: event._id });

  return res.status(202).json({
    success: true,
    message: "Webhook recebido e enfileirado para processamento.",
    eventId: event._id,
    status: EVENT_STATUS.QUEUED,
  });
}