import axios from "axios";
import { validateDestinationUrl } from "./ssrfProtectionService.js";
import { logger } from "../utils/logger.js";

/**
 * Envia notificação de alerta para o webhook configurado quando um evento atinge Dead Letter.
 */
export async function sendDeadLetterAlert({ event, integration, lastError, attempts }) {
  const alertUrl = integration?.alertWebhookUrl || process.env.ALERT_WEBHOOK_URL;

  if (!alertUrl) {
    return false;
  }

  try {
    await validateDestinationUrl(alertUrl);

    const integrationName = integration?.name || event.source || "Integração Desconhecida";
    const eventId = event._id?.toString() || String(event.id);
    const dateStr = new Date().toISOString();

    const title = `🚨 [FlowBridge Alert] Evento atingiu Dead Letter!`;
    const details = `• Integração: ${integrationName} (${integration?.slug || event.source})\n• Event ID: ${eventId}\n• Tentativas: ${attempts}\n• Erro: ${lastError || "Falha desconhecida"}\n• Horário: ${dateStr}`;

    const alertPayload = {
      // Compatível com Slack Webhooks
      text: `${title}\n${details}`,
      // Compatível com Discord Webhooks
      content: `${title}\n${details}`,
      // Dados estruturados
      event: {
        id: eventId,
        source: event.source,
        correlationId: event.correlationId,
        attempts,
        lastError,
        timestamp: dateStr,
      },
    };

    await axios.post(alertUrl, alertPayload, {
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "FlowBridge-Alerting/1.0",
      },
      timeout: 5000,
    });

    logger.info(`Alerta de Dead Letter enviado com sucesso para ${alertUrl} (Evento: ${eventId})`);
    return true;
  } catch (alertError) {
    logger.warn(`Falha ao disparar webhook de alerta de Dead Letter: ${alertError.message}`);
    return false;
  }
}
