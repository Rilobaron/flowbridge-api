import Event from "../models/Event.js";
import Integration from "../models/Integration.js";
import Delivery from "../models/Delivery.js";
import { transformPayload } from "./mappingService.js";
import { executeDelivery } from "./deliveryService.js";
import { createLog } from "./logService.js";
import { addEventJob } from "../queues/eventQueue.js";
import { EVENT_STATUS, DELIVERY_STATUS, LOG_LEVELS } from "../constants/index.js";
import { logger } from "../utils/logger.js";

/**
 * Orquestra o processamento completo e assíncrono de um evento.
 */
export async function processEvent(eventId) {
  const event = await Event.findById(eventId);

  if (!event) {
    logger.error(`Evento ${eventId} não encontrado para processamento.`);
    throw new Error(`Evento ${eventId} não encontrado`);
  }

  // Se o evento já foi processado com sucesso, não reprocessa
  if (event.status === EVENT_STATUS.SUCCESS) {
    logger.info(`Evento ${eventId} já foi concluído com sucesso. Ignorando.`);
    return event;
  }

  let integration = null;
  if (event.integrationId) {
    integration = await Integration.findById(event.integrationId);
  }

  // Fallback para integração legada se não houver integrationId
  if (!integration) {
    // Procura por slug = source
    integration = await Integration.findOne({ slug: event.source, isDeleted: false });
  }

  // Se ainda não tiver integração e existir EXTERNAL_API_URL no ambiente, cria integração fallback temporária
  if (!integration) {
    if (process.env.EXTERNAL_API_URL) {
      integration = new Integration({
        name: "Legacy Default Integration",
        slug: event.source || "default",
        enabled: true,
        destination: {
          url: process.env.EXTERNAL_API_URL,
          method: "POST",
        },
        retryPolicy: {
          enabled: true,
          maxAttempts: Number(process.env.MAX_RETRY_ATTEMPTS) || 3,
          initialDelay: Number(process.env.RETRY_DELAY_MS) || 1000,
          multiplier: 2,
          maxDelay: 60000,
        },
      });
    } else {
      event.status = EVENT_STATUS.DEAD_LETTER;
      event.lastError = "Nenhuma integração associada encontrada ou ativa para este evento.";
      await event.save();

      await createLog({
        eventId: event._id,
        correlationId: event.correlationId,
        level: LOG_LEVELS.ERROR,
        step: "integration_lookup_failed",
        message: event.lastError,
      });

      return event;
    }
  }

  if (!integration.enabled || integration.isDeleted) {
    event.status = EVENT_STATUS.DEAD_LETTER;
    event.lastError = `Integração '${integration.slug}' está desativada ou foi excluída.`;
    await event.save();

    await createLog({
      eventId: event._id,
      integrationId: integration._id,
      correlationId: event.correlationId,
      level: LOG_LEVELS.ERROR,
      step: "integration_disabled",
      message: event.lastError,
    });

    return event;
  }

  // Atualiza status para processing
  event.status = EVENT_STATUS.PROCESSING;
  await event.save();

  await createLog({
    eventId: event._id,
    integrationId: integration._id,
    correlationId: event.correlationId,
    level: LOG_LEVELS.INFO,
    step: "processing_started",
    message: `Iniciando processamento do evento (tentativa ${event.attempts + 1})`,
    attempt: event.attempts,
  });

  // 1. Aplica mapeamento dinâmico de JSON
  let transformedData = event.payload;
  if (integration.mapping) {
    try {
      transformedData = transformPayload(event.payload, integration.mapping);
      event.transformedPayload = transformedData;
      await event.save();

      await createLog({
        eventId: event._id,
        integrationId: integration._id,
        correlationId: event.correlationId,
        level: LOG_LEVELS.INFO,
        step: "data_transformed",
        message: "Payload transformado dinamicamente com sucesso",
        attempt: event.attempts,
        metadata: { transformedPayload: transformedData },
      });
    } catch (mappingErr) {
      logger.error(`Erro ao transformar payload: ${mappingErr.message}`);
    }
  }

  // 2. Localiza ou cria registro de Delivery
  let delivery = await Delivery.findOne({ eventId: event._id });
  if (!delivery) {
    delivery = await Delivery.create({
      eventId: event._id,
      integrationId: integration._id,
      status: DELIVERY_STATUS.PROCESSING,
      targetUrl: integration.destination.url,
      httpMethod: integration.destination.method || "POST",
      maxAttempts: integration.retryPolicy?.maxAttempts || 3,
      attemptsCount: 0,
    });
  } else {
    delivery.status = DELIVERY_STATUS.PROCESSING;
    delivery.lastAttemptAt = new Date();
    await delivery.save();
  }

  const currentAttempt = event.attempts + 1;
  event.attempts = currentAttempt;
  delivery.attemptsCount = currentAttempt;
  delivery.lastAttemptAt = new Date();

  // 3. Executa entrega HTTP ao destino
  await createLog({
    eventId: event._id,
    integrationId: integration._id,
    deliveryId: delivery._id,
    correlationId: event.correlationId,
    level: LOG_LEVELS.INFO,
    step: "destination_request_sent",
    message: `Enviando requisição para ${integration.destination.url} (tentativa ${currentAttempt})`,
    attempt: currentAttempt,
  });

  const deliveryResult = await executeDelivery({
    event,
    integration,
    payload: transformedData,
    attemptNumber: currentAttempt,
    deliveryId: delivery._id,
  });

  if (deliveryResult.success) {
    // SUCESSO
    event.status = EVENT_STATUS.SUCCESS;
    event.processedAt = new Date();
    event.lastError = null;
    await event.save();

    delivery.status = DELIVERY_STATUS.SUCCESS;
    delivery.responseStatus = deliveryResult.statusCode;
    delivery.responseBody = deliveryResult.responseData;
    delivery.lastError = null;
    await delivery.save();

    await createLog({
      eventId: event._id,
      integrationId: integration._id,
      deliveryId: delivery._id,
      correlationId: event.correlationId,
      level: LOG_LEVELS.SUCCESS,
      step: "delivery_success",
      message: `Entrega realizada com sucesso (Status: ${deliveryResult.statusCode}, Duração: ${deliveryResult.durationMs}ms)`,
      attempt: currentAttempt,
      metadata: {
        statusCode: deliveryResult.statusCode,
        response: deliveryResult.responseData,
      },
    });

    return event;
  }

  // FALHA
  event.lastError = deliveryResult.error;
  delivery.lastError = deliveryResult.error;
  delivery.responseStatus = deliveryResult.statusCode;
  delivery.responseBody = deliveryResult.responseData;

  const maxAttempts = integration.retryPolicy?.maxAttempts || 3;
  const isRetryEnabled = integration.retryPolicy?.enabled !== false;

  if (isRetryEnabled && deliveryResult.isRetryable && currentAttempt < maxAttempts) {
    // RETRY AGENDADO
    const delayMs = deliveryResult.nextRetryDelayMs || 1000;
    const nextRetryAt = new Date(Date.now() + delayMs);

    event.status = EVENT_STATUS.RETRYING;
    await event.save();

    delivery.status = DELIVERY_STATUS.RETRYING;
    delivery.nextRetryAt = nextRetryAt;
    await delivery.save();

    await createLog({
      eventId: event._id,
      integrationId: integration._id,
      deliveryId: delivery._id,
      correlationId: event.correlationId,
      level: LOG_LEVELS.WARNING,
      step: "retry_scheduled",
      message: `Tentativa ${currentAttempt} falhou. Próximo retry em ${delayMs}ms (tentativa ${currentAttempt + 1} de ${maxAttempts}).`,
      attempt: currentAttempt,
      metadata: {
        error: deliveryResult.error,
        statusCode: deliveryResult.statusCode,
        delayMs,
        nextRetryAt,
      },
    });

    // Enfileira próximo job com delay
    await addEventJob({
      eventId: event._id,
      attempt: currentAttempt + 1,
      delayMs,
    });
  } else {
    // DEAD LETTER / FAILED
    event.status = EVENT_STATUS.DEAD_LETTER;
    await event.save();

    delivery.status = DELIVERY_STATUS.DEAD_LETTER;
    await delivery.save();

    await createLog({
      eventId: event._id,
      integrationId: integration._id,
      deliveryId: delivery._id,
      correlationId: event.correlationId,
      level: LOG_LEVELS.ERROR,
      step: "dead_letter_reached",
      message: `Processamento do evento finalizado como Dead Letter após ${currentAttempt} tentativas. Erro: ${deliveryResult.error}`,
      attempt: currentAttempt,
      metadata: {
        error: deliveryResult.error,
        statusCode: deliveryResult.statusCode,
        maxAttempts,
        isRetryable: deliveryResult.isRetryable,
      },
    });
  }

  return event;
}