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

  // 2. Normaliza destinos (suporte a destination individual ou destinations array)
  if (!data.destinations || data.destinations.length === 0) {
    if (data.destination) {
      data.destinations = [data.destination];
    }
  }

  // 3. Valida URLs de todos os destinos contra SSRF
  if (data.destinations && Array.isArray(data.destinations)) {
    for (const dest of data.destinations) {
      if (dest.url) {
        await validateDestinationUrl(dest.url);
      }
    }
  }

  // 4. Cria a integração
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

  // Atualiza campos gerais
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

  // Atualiza destinos
  if (updateData.destinations && Array.isArray(updateData.destinations)) {
    for (const dest of updateData.destinations) {
      if (dest.url) {
        await validateDestinationUrl(dest.url);
      }
    }
    integration.destinations = updateData.destinations;
  } else if (updateData.destination) {
    if (updateData.destination.url) {
      await validateDestinationUrl(updateData.destination.url);
    }
    integration.destinations = [updateData.destination];
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

  integration.isDeleted = true;
  integration.enabled = false;
  await integration.save();

  return { message: "Integração removida com sucesso." };
}
