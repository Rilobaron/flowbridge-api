import swaggerUi from "swagger-ui-express";

export const swaggerDocument = {
  openapi: "3.0.0",
  info: {
    title: "FlowBridge API",
    version: "1.1.0",
    description:
      "API intermediária de integração genérica para recepção de webhooks, mapeamento dinâmico de dados, enfileiramento assíncrono, Fan-out para múltiplos destinos, autenticação OAuth2 e Dead Letter Queue.",
  },
  servers: [
    {
      url: "/",
      description: "Servidor Atual",
    },
  ],
  components: {
    securitySchemes: {
      AdminApiKey: {
        type: "apiKey",
        in: "header",
        name: "X-API-Key",
        description: "Chave de API Administrativa para gerenciamento",
      },
      WebhookApiKey: {
        type: "apiKey",
        in: "header",
        name: "X-API-Key",
        description: "API Key para autenticação de Webhooks inbound",
      },
      WebhookBearer: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT/Token",
      },
    },
    schemas: {
      ErrorResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: false },
          error: {
            type: "object",
            properties: {
              code: { type: "string", example: "VALIDATION_ERROR" },
              message: { type: "string", example: "Descrição do erro" },
              details: { type: "array", items: { type: "object" } },
            },
          },
        },
      },
      DestinationItem: {
        type: "object",
        properties: {
          name: { type: "string", example: "CRM" },
          url: { type: "string", example: "https://api.crm-exemplo.com/v1/leads" },
          method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE"], example: "POST" },
          headers: { type: "object", example: { "X-App": "FlowBridge" } },
          mapping: {
            type: "object",
            example: {
              lead_name: "customer.full_name",
              lead_email: "customer.email",
            },
          },
          authentication: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["none", "bearer", "apiKey", "basic", "oauth2"], example: "oauth2" },
              token: { type: "string", example: "********" },
              tokenUrl: { type: "string", example: "https://auth.crm-exemplo.com/oauth/token" },
              clientId: { type: "string", example: "client_id_123" },
              clientSecret: { type: "string", example: "********" },
              scope: { type: "string", example: "leads:write" },
            },
          },
        },
      },
      Integration: {
        type: "object",
        properties: {
          id: { type: "string", example: "64f1a2b3c4d5e6f7a8b9c0d1" },
          name: { type: "string", example: "Meta Leads para CRM & Data Lake" },
          slug: { type: "string", example: "meta-leads" },
          description: { type: "string", example: "Encaminha leads para múltiplos destinos simultaneamente" },
          enabled: { type: "boolean", example: true },
          source: {
            type: "object",
            properties: {
              authenticationType: { type: "string", enum: ["none", "api_key", "bearer", "hmac"], example: "api_key" },
              secret: { type: "string", example: "********" },
            },
          },
          destinations: {
            type: "array",
            items: { $ref: "#/components/schemas/DestinationItem" },
          },
          mapping: {
            type: "object",
            example: {
              name: "customer.full_name",
              email: "customer.email",
              origin: "_fixed:meta_ads",
            },
          },
          retryPolicy: {
            type: "object",
            properties: {
              enabled: { type: "boolean", example: true },
              maxAttempts: { type: "integer", example: 3 },
              initialDelay: { type: "integer", example: 1000 },
              multiplier: { type: "number", example: 2 },
              maxDelay: { type: "integer", example: 60000 },
            },
          },
          timeout: { type: "integer", example: 5000 },
        },
      },
    },
  },
  paths: {
    "/health": {
      get: {
        summary: "Health check simples",
        responses: {
          200: { description: "API em execução" },
        },
      },
    },
    "/ready": {
      get: {
        summary: "Readiness probe (verifica MongoDB e Redis)",
        responses: {
          200: { description: "Serviços prontos para receber tráfego" },
          503: { description: "Serviço indisponível" },
        },
      },
    },
    "/metrics": {
      get: {
        summary: "Métricas no formato padrão do Prometheus",
        responses: {
          200: { description: "Métricas para scraping do Prometheus" },
        },
      },
    },
    "/api/v1/integrations": {
      post: {
        summary: "Criar uma nova integração",
        security: [{ AdminApiKey: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Integration" },
            },
          },
        },
        responses: {
          201: { description: "Integração criada com sucesso" },
          400: { description: "Erro de validação ou SSRF" },
          409: { description: "Slug já em uso" },
        },
      },
      get: {
        summary: "Listar integrações cadastradas",
        security: [{ AdminApiKey: [] }],
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 10 } },
          { name: "search", in: "query", schema: { type: "string" } },
          { name: "enabled", in: "query", schema: { type: "boolean" } },
        ],
        responses: {
          200: { description: "Lista de integrações" },
        },
      },
    },
    "/api/v1/integrations/{id}": {
      get: {
        summary: "Consultar detalhes de uma integração",
        security: [{ AdminApiKey: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: { description: "Detalhes da integração" },
          404: { description: "Integração não encontrada" },
        },
      },
      patch: {
        summary: "Atualizar uma integração existente",
        security: [{ AdminApiKey: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: { description: "Integração atualizada" },
          404: { description: "Integração não encontrada" },
        },
      },
      delete: {
        summary: "Excluir (soft delete) uma integração",
        security: [{ AdminApiKey: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: { description: "Integração desativada/removida" },
        },
      },
    },
    "/api/v1/webhooks/{slug}": {
      post: {
        summary: "Receber webhook para uma integração específica",
        parameters: [
          { name: "slug", in: "path", required: true, schema: { type: "string" }, description: "Slug da integração" },
          { name: "Idempotency-Key", in: "header", required: false, schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { type: "object" },
            },
          },
        },
        responses: {
          202: {
            description: "Webhook recebido e enfileirado para processamento assíncrono (Fan-out)",
          },
          200: { description: "Evento idempotente já recebido anteriormente" },
          401: { description: "Falha de autenticação do webhook" },
          404: { description: "Integração não encontrada" },
        },
      },
    },
    "/api/v1/events": {
      get: {
        summary: "Listar eventos processados",
        security: [{ AdminApiKey: [] }],
        parameters: [
          { name: "status", in: "query", schema: { type: "string", enum: ["received", "queued", "processing", "retrying", "success", "failed", "dead_letter"] } },
          { name: "source", in: "query", schema: { type: "string" } },
          { name: "eventType", in: "query", schema: { type: "string" } },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 10 } },
        ],
        responses: {
          200: { description: "Lista de eventos" },
        },
      },
    },
    "/api/v1/events/stats": {
      get: {
        summary: "Estatísticas agregadas e taxa de sucesso dos eventos",
        security: [{ AdminApiKey: [] }],
        responses: {
          200: { description: "Métricas consolidadas de eventos" },
        },
      },
    },
    "/api/v1/events/{id}": {
      get: {
        summary: "Consultar detalhes completos de um evento (inclui todas as entregas fan-out e tentativas HTTP)",
        security: [{ AdminApiKey: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: { description: "Detalhes do evento, payload transformado e tentativas" },
          404: { description: "Evento não encontrado" },
        },
      },
    },
    "/api/v1/events/{id}/retry": {
      post: {
        summary: "Reprocessar manualmente um evento (Dead Letter)",
        security: [{ AdminApiKey: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: { description: "Evento reenfileirado para processamento" },
        },
      },
    },
    "/api/v1/events/{id}/logs": {
      get: {
        summary: "Listar logs de auditoria de um evento",
        security: [{ AdminApiKey: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: { description: "Histórico de logs do evento" },
        },
      },
    },
    "/api/v1/logs": {
      get: {
        summary: "Listar todos os logs do sistema",
        security: [{ AdminApiKey: [] }],
        responses: {
          200: { description: "Lista geral de logs paginada" },
        },
      },
    },
  },
};

export function setupSwagger(app) {
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
  app.get("/docs.json", (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.send(swaggerDocument);
  });
}
