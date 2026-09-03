import * as integrationService from "../services/integrationService.js";

export async function createIntegration(req, res) {
  const integration = await integrationService.createIntegration(req.body);

  return res.status(201).json({
    success: true,
    message: "Integração criada com sucesso.",
    data: integration,
  });
}

export async function listIntegrations(req, res) {
  const { page, limit, search, enabled } = req.query;

  const result = await integrationService.listIntegrations({
    page,
    limit,
    search,
    enabled: enabled !== undefined ? enabled === "true" || enabled === true : undefined,
  });

  return res.status(200).json({
    success: true,
    data: result.integrations,
    pagination: result.pagination,
  });
}

export async function getIntegrationById(req, res) {
  const { id } = req.params;
  const integration = await integrationService.getIntegrationById(id);

  return res.status(200).json({
    success: true,
    data: integration,
  });
}

export async function updateIntegration(req, res) {
  const { id } = req.params;
  const updated = await integrationService.updateIntegration(id, req.body);

  return res.status(200).json({
    success: true,
    message: "Integração atualizada com sucesso.",
    data: updated,
  });
}

export async function deleteIntegration(req, res) {
  const { id } = req.params;
  const result = await integrationService.deleteIntegration(id);

  return res.status(200).json({
    success: true,
    message: result.message,
  });
}
