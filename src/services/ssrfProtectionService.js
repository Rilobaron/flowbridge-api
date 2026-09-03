import dns from "dns/promises";
import ipaddr from "ipaddr.js";
import { AppError } from "../utils/AppError.js";
import { ERROR_CODES } from "../constants/index.js";

/**
 * Verifica se um endereço IP é privado, loopback, link-local ou reservado.
 */
export function isPrivateIp(ipString) {
  try {
    const addr = ipaddr.parse(ipString);
    const range = addr.range();

    const blockedRanges = [
      "unspecified",
      "broadcast",
      "linkLocal",
      "loopback",
      "private",
      "reserved",
      "carrierGradeNat",
    ];

    return blockedRanges.includes(range);
  } catch {
    return true;
  }
}

/**
 * Valida uma URL de destino contra ataques de SSRF (Server-Side Request Forgery).
 */
export async function validateDestinationUrl(urlString) {
  if (!urlString || typeof urlString !== "string") {
    throw new AppError("URL de destino é inválida.", 400, ERROR_CODES.VALIDATION_ERROR);
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(urlString);
  } catch {
    throw new AppError("Formato de URL inválido.", 400, ERROR_CODES.VALIDATION_ERROR);
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new AppError(
      `Protocolo '${parsedUrl.protocol}' não é permitido. Apenas HTTP e HTTPS são suportados.`,
      400,
      ERROR_CODES.SSRF_BLOCKED
    );
  }

  const allowLocal =
    process.env.ALLOW_LOCAL_DESTINATIONS === "true" ||
    (process.env.NODE_ENV === "development" && process.env.ALLOW_LOCAL_DESTINATIONS !== "false");

  const hostname = parsedUrl.hostname.toLowerCase();

  const isLocalHost =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local");

  if (isLocalHost) {
    if (allowLocal) {
      return true;
    }
    throw new AppError(
      `Acesso ao host local '${hostname}' bloqueado por proteção SSRF.`,
      400,
      ERROR_CODES.SSRF_BLOCKED
    );
  }

  if (ipaddr.isValid(hostname)) {
    if (isPrivateIp(hostname)) {
      if (allowLocal) {
        return true;
      }
      throw new AppError(
        `Acesso ao IP privado '${hostname}' bloqueado por proteção SSRF.`,
        400,
        ERROR_CODES.SSRF_BLOCKED
      );
    }
    return true;
  }

  try {
    const addresses = await dns.lookup(hostname, { all: true });
    for (const record of addresses) {
      if (isPrivateIp(record.address)) {
        if (allowLocal) {
          return true;
        }
        throw new AppError(
          `O domínio '${hostname}' resolve para o endereço privado '${record.address}', bloqueado por SSRF.`,
          400,
          ERROR_CODES.SSRF_BLOCKED
        );
      }
    }
  } catch (dnsError) {
    if (dnsError instanceof AppError) throw dnsError;
    if (!allowLocal) {
      throw new AppError(
        `Não foi possível resolver o domínio '${hostname}': ${dnsError.message}`,
        400,
        ERROR_CODES.VALIDATION_ERROR
      );
    }
  }

  return true;
}
