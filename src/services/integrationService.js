import Integration from "../models/Integration.js";
import { AppError } from "../utils/AppError.js";
import { ERROR_CODES } from "../constants/index.js";
import { validateDestinationUrl } from "./ssrfProtectionService.js";
import { encrypt } from "./encryptionService.js";

export async function createIntegration(data) {
  // 1. Verifica se o slug já está em uso
  const existing = await Integration.findOne({ slug: data.slug.toLowerCase() });
  if (existing) {
    throw new AppError(
      `Já existe uma integração com o slug '${data.slug}'.`,
      409,
      ERROR_CODES.VALIDATION_ERROR
    );
  }

  // 2. Valida URL do destino contra SSRF
  if (data.destination?.url) {
    await validateDestinationUrl(data.destination.url);
  }

  // 3. Cria a integração
  const integration = await Integration.create(data);
  return integration;
}

export async function listIntegrations({ page = 1, limit = 10, search, enabled }) {
  const query = { isDeleted: false };

  if (typeof enabled === "boolean") {
    query.enabled = enabled;
  }

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { slug: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
    ];
  }

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 10));
  const skip = (pageNum - 1) * limitNum;

  const [integrations, total] = await Promise.all([
    Integration.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
    Integration.countDocuments(query),
  ]);

  return {
    integrations,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    },
  };
}

export async function getIntegrationById(id) {
  const integration = await Integration.findOne({ _id: id, isDeleted: false });
  if (!integration) {
    throw new AppError("Integração não encontrada.", 404, ERROR_CODES.INTEGRATION_NOT_FOUND);
  }
  return integration;
}

export async function getIntegrationBySlug(slug) {
  const integration = await Integration.findOne({
    slug: slug.toLowerCase(),
    isDeleted: false,
  });
  if (!integration) {
    throw new AppError(
      `Integração com slug '${slug}' não encontrada.`,
      404,
      ERROR_CODES.INTEGRATION_NOT_FOUND
    );
  }
  return integration;
}

export async function updateIntegration(id, updateData) {
  const integration = await Integration.findOne({ _id: id, isDeleted: false });
  if (!integration) {
    throw new AppError("Integração não encontrada.", 404, ERROR_CODES.INTEGRATION_NOT_FOUND);
  }

  // Se estiver atualizando o slug, verifica unicidade
  if (updateData.slug && updateData.slug.toLowerCase() !== integration.slug) {
    const slugInUse = await Integration.findOne({
      slug: updateData.slug.toLowerCase(),
      _id: { $ne: id },
    });
    if (slugInUse) {
      throw new AppError(
        `O slug '${updateData.slug}' já está sendo utilizado por outra integração.`,
        409,
        ERROR_CODES.VALIDATION_ERROR
      );
    }
    integration.slug = updateData.slug.toLowerCase();
  }

  // Se estiver atualizando a URL de destino, valida SSRF
  if (updateData.destination?.url) {
    await validateDestinationUrl(updateData.destination.url);
  }

  // Atualiza campos permitidos
  if (updateData.name) integration.name = updateData.name;
  if (updateData.description !== undefined) integration.description = updateData.description;
  if (typeof updateData.enabled === "boolean") integration.enabled = updateData.enabled;
  if (updateData.mapping !== undefined) integration.mapping = updateData.mapping;
  if (updateData.timeout) integration.timeout = updateData.timeout;

  if (updateData.source) {
    if (updateData.source.authenticationType) {
      integration.source.authenticationType = updateData.source.authenticationType;
    }
    if (updateData.source.secret !== undefined) {
      integration.source.secret = updateData.source.secret ? encrypt(updateData.source.secret) : null;
    }
    if (updateData.source.headerName !== undefined) {
      integration.source.headerName = updateData.source.headerName;
    }
  }

  if (updateData.destination) {
    if (updateData.destination.url) integration.destination.url = updateData.destination.url;
    if (updateData.destination.method) integration.destination.method = updateData.destination.method;
    if (updateData.destination.headers) integration.destination.headers = updateData.destination.headers;

    if (updateData.destination.authentication) {
      const destAuth = updateData.destination.authentication;
      if (destAuth.type) integration.destination.authentication.type = destAuth.type;
      if (destAuth.token !== undefined) {
        integration.destination.authentication.token = destAuth.token ? encrypt(destAuth.token) : null;
      }
      if (destAuth.username !== undefined) {
        integration.destination.authentication.username = destAuth.username;
      }
      if (destAuth.password !== undefined) {
        integration.destination.authentication.password = destAuth.password ? encrypt(destAuth.password) : null;
      }
      if (destAuth.apiKey !== undefined) {
        integration.destination.authentication.apiKey = destAuth.apiKey ? encrypt(destAuth.apiKey) : null;
      }
      if (destAuth.apiKeyHeader !== undefined) {
        integration.destination.authentication.apiKeyHeader = destAuth.apiKeyHeader;
      }
    }
  }

  if (updateData.retryPolicy) {
    integration.retryPolicy = {
      ...integration.retryPolicy.toObject(),
      ...updateData.retryPolicy,
    };
  }

  await integration.save();
  return integration;
}

export async function deleteIntegration(id) {
  const integration = await Integration.findOne({ _id: id, isDeleted: false });
  if (!integration) {
    throw new AppError("Integração não encontrada.", 404, ERROR_CODES.INTEGRATION_NOT_FOUND);
  }

  // Soft delete para não quebrar histórico de eventos
  integration.isDeleted = true;
  integration.enabled = false;
  await integration.save();

  return { message: "Integração removida com sucesso." };
}
