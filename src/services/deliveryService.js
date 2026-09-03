import axios from "axios";
import DeliveryAttempt from "../models/DeliveryAttempt.js";
import { validateDestinationUrl } from "./ssrfProtectionService.js";
import { getOAuthAccessToken } from "./oauthService.js";
import {
  OUTBOUND_AUTH_TYPE,
  RETRYABLE_HTTP_STATUSES,
  NON_RETRYABLE_HTTP_STATUSES,
} from "../constants/index.js";

/**
 * Calcula se um erro HTTP ou de rede deve ser reenviado (retryable).
 */
export function isRetryableError(error, responseStatus) {
  if (responseStatus) {
    if (RETRYABLE_HTTP_STATUSES.includes(responseStatus)) {
      return true;
    }
    if (NON_RETRYABLE_HTTP_STATUSES.includes(responseStatus)) {
      return false;
    }
    return responseStatus >= 500;
  }

  const retryableNetworkCodes = [
    "ECONNRESET",
    "ETIMEDOUT",
    "ECONNREFUSED",
    "EAI_AGAIN",
    "ENOTFOUND",
    "ERR_BAD_RESPONSE",
  ];

  if (error?.code && retryableNetworkCodes.includes(error.code)) {
    return true;
  }

  if (error?.message?.toLowerCase().includes("timeout")) {
    return true;
  }

  return false;
}

/**
 * Calcula o tempo de espera para o próximo retry utilizando Exponential Backoff com jitter.
 */
export function calculateBackoffDelay(attemptNumber, retryPolicy = {}) {
  const initialDelay = retryPolicy.initialDelay || 1000;
  const multiplier = retryPolicy.multiplier || 2;
  const maxDelay = retryPolicy.maxDelay || 60000;

  const baseDelay = initialDelay * Math.pow(multiplier, Math.max(0, attemptNumber - 1));
  const cappedDelay = Math.min(baseDelay, maxDelay);

  const jitter = cappedDelay * 0.1 * (Math.random() * 2 - 1);
  return Math.max(500, Math.round(cappedDelay + jitter));
}

/**
 * Mascara cabeçalhos sensíveis para auditoria no DeliveryAttempt
 */
function sanitizeHeaders(headers = {}) {
  const sanitized = { ...headers };
  const sensitiveKeys = ["authorization", "x-api-key", "token", "apiKey", "apikey", "cookie"];

  for (const key of Object.keys(sanitized)) {
    if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) {
      sanitized[key] = "********";
    }
  }
  return sanitized;
}

/**
 * Executa uma tentativa de entrega HTTP ao destino configurado
 */
export async function executeDelivery({
  event,
  integration,
  destination = null,
  destinationIndex = 0,
  payload,
  attemptNumber = 1,
  deliveryId,
}) {
  // Se destino não for passado explicitamente, resolve a partir da integração
  const targetDest =
    destination ||
    (integration.destinations && integration.destinations[destinationIndex]
      ? integration.destinations[destinationIndex]
      : integration.destination);

  const targetUrl = targetDest.url;
  const method = (targetDest.method || "POST").toUpperCase();
  const timeout = targetDest.timeout || integration.timeout || 5000;

  // Validação SSRF
  await validateDestinationUrl(targetUrl);

  // Recupera credenciais descriptografadas do destino
  const credentials = integration.getDecryptedCredentials
    ? integration.getDecryptedCredentials(destinationIndex)
    : {};

  // Constrói headers
  const headers = {
    "Content-Type": "application/json",
    "User-Agent": "FlowBridge-API/1.0",
    "X-Event-Id": event._id.toString(),
    "X-Correlation-Id": event.correlationId || event._id.toString(),
    "X-Attempt-Number": String(attemptNumber),
  };

  // Aplica headers customizados do destino
  if (targetDest.headers) {
    const customHeaders =
      targetDest.headers instanceof Map
        ? Object.fromEntries(targetDest.headers)
        : targetDest.headers;

    Object.assign(headers, customHeaders);
  }

  // Aplica autenticação outbound
  const authConfig = targetDest.authentication || {};
  const authType = authConfig.type || OUTBOUND_AUTH_TYPE.NONE;

  if (authType === OUTBOUND_AUTH_TYPE.BEARER && credentials.destinationToken) {
    headers["Authorization"] = `Bearer ${credentials.destinationToken}`;
  } else if (authType === OUTBOUND_AUTH_TYPE.API_KEY && credentials.destinationApiKey) {
    const headerName = authConfig.apiKeyHeader || "X-API-Key";
    headers[headerName] = credentials.destinationApiKey;
  } else if (authType === OUTBOUND_AUTH_TYPE.BASIC) {
    const username = credentials.destinationUsername || "";
    const password = credentials.destinationPassword || "";
    const token = Buffer.from(`${username}:${password}`).toString("base64");
    headers["Authorization"] = `Basic ${token}`;
  } else if (authType === OUTBOUND_AUTH_TYPE.OAUTH2) {
    const tokenUrl = authConfig.tokenUrl;
    const clientId = credentials.destinationClientId || authConfig.clientId;
    const clientSecret = credentials.destinationClientSecret;

    const accessToken = await getOAuthAccessToken({
      tokenUrl,
      clientId,
      clientSecret,
      scope: authConfig.scope,
      timeout,
    });

    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const startTime = Date.now();
  let responseStatus = null;
  let responseHeaders = {};
  let responseBody = null;
  let errorMsg = null;
  let rawError = null;

  try {
    const response = await axios({
      url: targetUrl,
      method,
      data: method !== "GET" ? payload : undefined,
      params: method === "GET" ? payload : undefined,
      headers,
      timeout,
      validateStatus: (status) => status >= 200 && status < 300,
    });

    const durationMs = Date.now() - startTime;
    responseStatus = response.status;
    responseHeaders = response.headers;
    responseBody = response.data;

    await DeliveryAttempt.create({
      deliveryId,
      eventId: event._id,
      attemptNumber,
      request: {
        url: targetUrl,
        method,
        headers: sanitizeHeaders(headers),
        body: payload,
      },
      response: {
        status: responseStatus,
        headers: responseHeaders,
        body: responseBody,
        durationMs,
      },
      success: true,
      error: null,
    });

    return {
      success: true,
      statusCode: responseStatus,
      responseData: responseBody,
      durationMs,
      isRetryable: false,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    rawError = error;

    if (error.response) {
      responseStatus = error.response.status;
      responseHeaders = error.response.headers;
      responseBody = error.response.data;
      errorMsg = `Destination HTTP Error: ${responseStatus} ${error.message}`;
    } else if (error.code === "ECONNABORTED" || error.message.includes("timeout")) {
      errorMsg = `Destination Request Timeout (${timeout}ms)`;
    } else {
      errorMsg = `Destination Network Error: ${error.message}`;
    }

    const retryable = isRetryableError(error, responseStatus);
    const retryDelay = calculateBackoffDelay(attemptNumber, integration.retryPolicy);

    await DeliveryAttempt.create({
      deliveryId,
      eventId: event._id,
      attemptNumber,
      request: {
        url: targetUrl,
        method,
        headers: sanitizeHeaders(headers),
        body: payload,
      },
      response: {
        status: responseStatus,
        headers: responseHeaders,
        body: responseBody,
        durationMs,
      },
      success: false,
      error: errorMsg,
    });

    return {
      success: false,
      statusCode: responseStatus,
      responseData: responseBody,
      durationMs,
      error: errorMsg,
      isRetryable: retryable,
      nextRetryDelayMs: retryDelay,
      rawError,
    };
  }
}
