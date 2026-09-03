import Event from "../models/Event.js";
import Integration from "../models/Integration.js";
import Delivery from "../models/Delivery.js";
import { transformPayload } from "./mappingService.js";
import { matchesFilter } from "./filterService.js";
import { executeDelivery } from "./deliveryService.js";
import { sendDeadLetterAlert } from "./alertService.js";
import { createLog } from "./logService.js";
import { addEventJob } from "../queues/eventQueue.js";
import { EVENT_STATUS, DELIVERY_STATUS, LOG_LEVELS } from "../constants/index.js";
import { logger } from "../utils/logger.js";

/**
 * Orquestra o processamento completo e assíncrono de um evento com suporte a Fan-out, Filtros e Alertas.
 */
export async function processEvent(eventId) {
  const event = await Event.findById(eventId);

  if (!event) {
    logger.error(`Evento ${eventId} não encontrado para processamento.`);
    throw new Error(`Evento ${eventId} não encontrado`);
  }

  // Se o evento já foi processado com sucesso ou pulado por filtro, ignora
  if (event.status === EVENT_STATUS.SUCCESS || event.status === EVENT_STATUS.SKIPPED) {
    logger.info(`Evento ${eventId} já foi finalizado (${event.status}). Ignorando.`);
    return event;
  }

  let integration = null;
  if (event.integrationId) {
    integration = await Integration.findById(event.integrationId);
  }

  if (!integration) {
    integration = await Integration.findOne({ slug: event.source, isDeleted: false });
  }

  // Fallback para integração legada se não houver no banco
  if (!integration) {
    if (process.env.EXTERNAL_API_URL) {
      integration = new Integration({
        name: "Legacy Default Integration",
        slug: event.source || "default",
        enabled: true,
        destinations: [
          {
            name: "primary",
            url: process.env.EXTERNAL_API_URL,
            method: "POST",
          },
        ],
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

  event.status = EVENT_STATUS.PROCESSING;
  await event.save();

  // Lista de destinos (Fan-out)
  const destinations =
    integration.destinations && integration.destinations.length > 0
      ? integration.destinations
      : [integration.destination];

  await createLog({
    eventId: event._id,
    integrationId: integration._id,
    correlationId: event.correlationId,
    level: LOG_LEVELS.INFO,
    step: "processing_started",
    message: `Iniciando processamento fan-out para ${destinations.length} destino(s)`,
    attempt: event.attempts,
    metadata: { totalDestinations: destinations.length },
  });

  // Mapeamento global se configurado
  let globalTransformed = event.payload;
  if (integration.mapping) {
    try {
      globalTransformed = transformPayload(event.payload, integration.mapping);
      event.transformedPayload = globalTransformed;
      await event.save();
    } catch (mappingErr) {
      logger.error(`Erro ao transformar payload global: ${mappingErr.message}`);
    }
  }

  const maxAttempts = integration.retryPolicy?.maxAttempts || 3;
  const isRetryEnabled = integration.retryPolicy?.enabled !== false;
  let minRetryDelay = null;

  // Processa cada destino concorrentemente de forma isolada
  const deliveryPromises = destinations.map(async (dest, index) => {
    let delivery = await Delivery.findOne({
      eventId: event._id,
      destinationIndex: index,
    });

    if (!delivery) {
      delivery = await Delivery.create({
        eventId: event._id,
        integrationId: integration._id,
        destinationIndex: index,
        destinationName: dest.name || `dest-${index}`,
        status: DELIVERY_STATUS.PROCESSING,
        targetUrl: dest.url,
        httpMethod: dest.method || "POST",
        maxAttempts,
        attemptsCount: 0,
      });
    } else {
      if (delivery.status === DELIVERY_STATUS.SUCCESS || delivery.status === DELIVERY_STATUS.SKIPPED) {
        return { index, status: delivery.status, skipped: true };
      }
      delivery.status = DELIVERY_STATUS.PROCESSING;
      delivery.lastAttemptAt = new Date();
      await delivery.save();
    }

    // 1. Avalia Filtro Condicional Global ou do Destino
    const filterToApply = dest.filter || integration.filter;
    if (filterToApply) {
      const filterResult = matchesFilter(event.payload, filterToApply);
      if (!filterResult.matches) {
        delivery.status = DELIVERY_STATUS.SKIPPED;
        delivery.lastError = filterResult.reason;
        await delivery.save();

        await createLog({
          eventId: event._id,
          integrationId: integration._id,
          deliveryId: delivery._id,
          correlationId: event.correlationId,
          level: LOG_LEVELS.INFO,
          step: "delivery_skipped",
          message: `Destino [${dest.name || index}] pulado por regra de filtro: ${filterResult.reason}`,
        });

        return { index, status: DELIVERY_STATUS.SKIPPED, skipped: true };
      }
    }

    const currentAttempt = delivery.attemptsCount + 1;
    delivery.attemptsCount = currentAttempt;
    delivery.lastAttemptAt = new Date();

    // Aplica mapping específico do destino se configurado
    let destPayload = globalTransformed;
    if (dest.mapping) {
      try {
        destPayload = transformPayload(event.payload, dest.mapping);
      } catch (err) {
        logger.error(`Erro ao transformar mapping do destino ${dest.name}: ${err.message}`);
      }
    }

    const result = await executeDelivery({
      event,
      integration,
      destination: dest,
      destinationIndex: index,
      payload: destPayload,
      attemptNumber: currentAttempt,
      deliveryId: delivery._id,
    });

    if (result.success) {
      delivery.status = DELIVERY_STATUS.SUCCESS;
      delivery.responseStatus = result.statusCode;
      delivery.responseBody = result.responseData;
      delivery.lastError = null;
      await delivery.save();

      await createLog({
        eventId: event._id,
        integrationId: integration._id,
        deliveryId: delivery._id,
        correlationId: event.correlationId,
        level: LOG_LEVELS.SUCCESS,
        step: "delivery_success",
        message: `Destino [${dest.name || index}] entregue com sucesso (Status: ${result.statusCode}, Latência: ${result.durationMs}ms)`,
        attempt: currentAttempt,
      });

      return { index, status: DELIVERY_STATUS.SUCCESS };
    }

    // Falha neste destino
    delivery.lastError = result.error;
    delivery.responseStatus = result.statusCode;
    delivery.responseBody = result.responseData;

    if (isRetryEnabled && result.isRetryable && currentAttempt < maxAttempts) {
      const delayMs = result.nextRetryDelayMs || 1000;
      delivery.status = DELIVERY_STATUS.RETRYING;
      delivery.nextRetryAt = new Date(Date.now() + delayMs);
      await delivery.save();

      if (minRetryDelay === null || delayMs < minRetryDelay) {
        minRetryDelay = delayMs;
      }

      await createLog({
        eventId: event._id,
        integrationId: integration._id,
        deliveryId: delivery._id,
        correlationId: event.correlationId,
        level: LOG_LEVELS.WARNING,
        step: "retry_scheduled",
        message: `Destino [${dest.name || index}] falhou. Retry agendado em ${delayMs}ms (tentativa ${currentAttempt + 1} de ${maxAttempts}).`,
        attempt: currentAttempt,
        metadata: { error: result.error, delayMs },
      });

      return { index, status: DELIVERY_STATUS.RETRYING, delayMs };
    }

    // Dead letter para este destino
    delivery.status = DELIVERY_STATUS.DEAD_LETTER;
    await delivery.save();

    await createLog({
      eventId: event._id,
      integrationId: integration._id,
      deliveryId: delivery._id,
      correlationId: event.correlationId,
      level: LOG_LEVELS.ERROR,
      step: "dead_letter_reached",
      message: `Destino [${dest.name || index}] finalizado em Dead Letter após ${currentAttempt} tentativas.`,
      attempt: currentAttempt,
      metadata: { error: result.error },
    });

    return { index, status: DELIVERY_STATUS.DEAD_LETTER, error: result.error };
  });

  const results = await Promise.all(deliveryPromises);

  // Consolidação do status do Evento
  const allDeliveries = await Delivery.find({ eventId: event._id });
  const hasRetrying = allDeliveries.some((d) => d.status === DELIVERY_STATUS.RETRYING);
  const hasDeadLetter = allDeliveries.some((d) => d.status === DELIVERY_STATUS.DEAD_LETTER);
  const allSkipped = allDeliveries.length > 0 && allDeliveries.every((d) => d.status === DELIVERY_STATUS.SKIPPED);
  const allResolved =
    allDeliveries.length > 0 &&
    allDeliveries.every((d) => d.status === DELIVERY_STATUS.SUCCESS || d.status === DELIVERY_STATUS.SKIPPED);

  event.attempts += 1;

  if (allSkipped) {
    event.status = EVENT_STATUS.SKIPPED;
    event.processedAt = new Date();
  } else if (allResolved) {
    event.status = EVENT_STATUS.SUCCESS;
    event.processedAt = new Date();
    event.lastError = null;
  } else if (hasRetrying) {
    event.status = EVENT_STATUS.RETRYING;
    if (minRetryDelay !== null) {
      await addEventJob({
        eventId: event._id,
        attempt: event.attempts + 1,
        delayMs: minRetryDelay,
      });
    }
  } else if (hasDeadLetter) {
    event.status = EVENT_STATUS.DEAD_LETTER;
    event.lastError = results.find((r) => r.error)?.error || "Um ou mais destinos falharam.";

    // Dispara alerta automático de Dead Letter
    sendDeadLetterAlert({
      event,
      integration,
      lastError: event.lastError,
      attempts: event.attempts,
    }).catch((alertErr) => {
      logger.warn(`Erro não-bloqueante no envio de alerta Dead Letter: ${alertErr.message}`);
    });
  }

  await event.save();
  return event;
}