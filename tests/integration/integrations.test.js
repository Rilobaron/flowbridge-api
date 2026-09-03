import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../../src/app.js";

describe("Integrations API (Integration Tests)", () => {
  const adminHeaders = {
    "X-API-Key": "test_admin_secret_key",
  };

  const sampleIntegration = {
    name: "Meta Leads para CRM",
    slug: "meta-leads",
    description: "Integração do Facebook Ads com o CRM",
    source: {
      authenticationType: "api_key",
      secret: "meta_secret_key_123",
    },
    destination: {
      url: "https://jsonplaceholder.typicode.com/posts",
      method: "POST",
      authentication: {
        type: "bearer",
        token: "destination_bearer_token_abc",
      },
    },
    mapping: {
      name: "lead.name",
      email: "lead.email",
    },
    retryPolicy: {
      enabled: true,
      maxAttempts: 3,
      initialDelay: 1000,
    },
  };

  it("deve bloquear requisições sem API Key administrativa", async () => {
    const res = await request(app).get("/api/v1/integrations");
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("deve bloquear requisições com API Key administrativa inválida", async () => {
    const res = await request(app)
      .get("/api/v1/integrations")
      .set("X-API-Key", "chave_errada");

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it("deve criar uma nova integração com sucesso", async () => {
    const res = await request(app)
      .post("/api/v1/integrations")
      .set(adminHeaders)
      .send(sampleIntegration);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.slug).toBe("meta-leads");
    // Secrets devem estar mascarados
    expect(res.body.data.source.secret).toBe("********");
    expect(res.body.data.destination.authentication.token).toBe("********");
  });

  it("deve rejeitar criação com slug duplicado", async () => {
    // Cria primeira vez
    await request(app)
      .post("/api/v1/integrations")
      .set(adminHeaders)
      .send(sampleIntegration);

    // Tenta criar com mesmo slug
    const res = await request(app)
      .post("/api/v1/integrations")
      .set(adminHeaders)
      .send(sampleIntegration);

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it("deve listar integrações com paginação", async () => {
    await request(app)
      .post("/api/v1/integrations")
      .set(adminHeaders)
      .send(sampleIntegration);

    const res = await request(app)
      .get("/api/v1/integrations?page=1&limit=10")
      .set(adminHeaders);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagination.total).toBe(1);
  });

  it("deve consultar uma integração por ID e retornar dados mascarados", async () => {
    const created = await request(app)
      .post("/api/v1/integrations")
      .set(adminHeaders)
      .send(sampleIntegration);

    const id = created.body.data._id;

    const res = await request(app)
      .get(`/api/v1/integrations/${id}`)
      .set(adminHeaders);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data._id).toBe(id);
    expect(res.body.data.source.secret).toBe("********");
  });

  it("deve atualizar uma integração com sucesso", async () => {
    const created = await request(app)
      .post("/api/v1/integrations")
      .set(adminHeaders)
      .send(sampleIntegration);

    const id = created.body.data._id;

    const res = await request(app)
      .patch(`/api/v1/integrations/${id}`)
      .set(adminHeaders)
      .send({
        name: "Meta Leads CRM Atualizado",
        enabled: false,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe("Meta Leads CRM Atualizado");
    expect(res.body.data.enabled).toBe(false);
  });

  it("deve fazer soft delete da integração", async () => {
    const created = await request(app)
      .post("/api/v1/integrations")
      .set(adminHeaders)
      .send(sampleIntegration);

    const id = created.body.data._id;

    const res = await request(app)
      .delete(`/api/v1/integrations/${id}`)
      .set(adminHeaders);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Consulta subsequente deve dar 404
    const checkRes = await request(app)
      .get(`/api/v1/integrations/${id}`)
      .set(adminHeaders);

    expect(checkRes.status).toBe(404);
  });
});
