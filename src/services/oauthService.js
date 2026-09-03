import axios from "axios";
import { AppError } from "../utils/AppError.js";
import { ERROR_CODES } from "../constants/index.js";
import { logger } from "../utils/logger.js";

// Cache em memória de tokens: chave -> { accessToken, expiresAt }
const tokenCache = new Map();

/**
 * Limpa o cache de tokens (útil para testes)
 */
export function clearOAuthCache() {
  tokenCache.clear();
}

/**
 * Obtém ou renova um Access Token via fluxo OAuth2 Client Credentials
 */
export async function getOAuthAccessToken({
  tokenUrl,
  clientId,
  clientSecret,
  scope = null,
  timeout = 5000,
}) {
  if (!tokenUrl || !clientId || !clientSecret) {
    throw new AppError(
      "Configuração OAuth2 incompleta: tokenUrl, clientId e clientSecret são obrigatórios.",
      400,
      ERROR_CODES.OAUTH_ERROR
    );
  }

  const cacheKey = `${tokenUrl}:::${clientId}`;
  const now = Date.now();

  // Verifica se o token existe no cache e ainda é válido (margem de segurança de 30 segundos)
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > now + 30000) {
    return cached.accessToken;
  }

  try {
    const params = new URLSearchParams();
    params.append("grant_type", "client_credentials");
    params.append("client_id", clientId);
    params.append("client_secret", clientSecret);
    if (scope) {
      params.append("scope", scope);
    }

    const response = await axios.post(tokenUrl, params.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      timeout,
    });

    const data = response.data;
    const accessToken = data.access_token || data.accessToken;
    const expiresIn = Number(data.expires_in) || 3600; // Padrão: 1 hora

    if (!accessToken) {
      throw new Error("Resposta do servidor OAuth2 não contém 'access_token'.");
    }

    const expiresAt = now + expiresIn * 1000;
    tokenCache.set(cacheKey, { accessToken, expiresAt });

    logger.info(`Novo token OAuth2 obtido com sucesso para o clientId: ${clientId} (expira em ${expiresIn}s)`);
    return accessToken;
  } catch (error) {
    const errorDetail = error.response?.data
      ? JSON.stringify(error.response.data)
      : error.message;

    logger.error(`Falha ao obter token OAuth2 de ${tokenUrl}: ${errorDetail}`);
    throw new AppError(
      `Falha na autenticação OAuth2 do destino: ${errorDetail}`,
      502,
      ERROR_CODES.OAUTH_ERROR
    );
  }
}
