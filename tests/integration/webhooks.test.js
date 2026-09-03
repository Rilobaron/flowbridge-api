import { describe, it, expect } from "vitest";
import request from "supertest";
import crypto from "crypto";
import app from "../../src/app.js";
import Event from "../../src/models/Event.js";

describe("Webhooks API (Integration Tests)", () => {
  const adminHeaders = { "X-API-Key": "test_admin_secret_key" };

  it("deve receber webhook e responder imediatamente com HTTP 202 Accepted", async () => {
    // 1. Cria integração aberta (auth: none)
    await request(app)
      .post("/api/v1/integrations")
      .set(adminHeaders)
      .send({
        name: "Webhook Aberto",
        slug: "open-webhook",
        destination: { url: "https://httpbin.org/post" },
      });

    // 2. Envia webhook
    const res = await request(app)
      .post("/api/v1/webhooks/open-webhook")
      .send({
        customer: { name: "Maria", email: "maria@test.com" },
      });

    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe("queued");
    expect(res.body.eventId).toBeDefined();

    // Verifica se o evento foi criado no MongoDB
    const event = await Event.findById(res.body.eventId);
    expect(event).toBeDefined();
    expect(event.source).toBe("open-webhook");
  });

  it("deve validar autenticação por API Key no webhook", async () => {
    await request(app)
      .post("/api/v1/integrations")
      .set(adminHeaders)
      .send({
        name: "Auth API Key",
        slug: "api-key-hook",
        source: {
          authenticationType: "api_key",
          secret: "minha_api_key_webhook_123",
        },
        destination: { url: "https://httpbin.org/post" },
      });

    // Sem chave -> 401
    const resNoKey = await request(app)
      .post("/api/v1/webhooks/api-key-hook")
      .send({ data: "test" });
    expect(resNoKey.status).toBe(401);

    // Com chave errada -> 401
    const resWrongKey = await request(app)
      .post("/api/v1/webhooks/api-key-hook")
      .set("X-API-Key", "chave_errada")
      .send({ data: "test" });
    expect(resWrongKey.status).toBe(401);

    // Com chave correta -> 202
    const resOk = await request(app)
      .post("/api/v1/webhooks/api-key-hook")
      .set("X-API-Key", "minha_api_key_webhook_123")
      .send({ data: "test" });
    expect(resOk.status).toBe(202);
  });

  it("deve validar autenticação por HMAC SHA-256 no webhook", async () => {
    const hmacSecret = "meu_hmac_secret_super_forte_456";

    await request(app)
      .post("/api/v1/integrations")
      .set(adminHeaders)
      .send({
        name: "Auth HMAC",
        slug: "hmac-hook",
        source: {
          authenticationType: "hmac",
          secret: hmacSecret,
        },
        destination: { url: "https://httpbin.org/post" },
      });

    const payload = { event: "payment_received", amount: 150.0 };
    const rawBody = JSON.stringify(payload);
    const validSignature = crypto
      .createHmac("sha256", hmacSecret)
      .update(rawBody)
      .digest("hex");

    // Assinatura inválida -> 401
    const resInvalid = await request(app)
      .post("/api/v1/webhooks/hmac-hook")
      .set("X-Signature", "assinatura_falsa_123")
      .send(payload);
    expect(resInvalid.status).toBe(401);

    // Assinatura válida -> 202
    const resValid = await request(app)
      .post("/api/v1/webhooks/hmac-hook")
      .set("X-Signature", validSignature)
      .send(payload);
    expect(resValid.status).toBe(202);
  });

  it("deve garantir idempotência em requisições duplicadas com Idempotency-Key", async () => {
    await request(app)
      .post("/api/v1/integrations")
      .set(adminHeaders)
      .send({
        name: "Idempotent Hook",
        slug: "idempotent-hook",
        destination: { url: "https://httpbin.org/post" },
      });

    const headers = { "Idempotency-Key": "unique-payment-uuid-999" };
    const body = { transactionId: "999", amount: 50 };

    // Primeiro envio -> 202
    const res1 = await request(app)
      .post("/api/v1/webhooks/idempotent-hook")
      .set(headers)
      .send(body);
    expect(res1.status).toBe(202);
    const eventId = res1.body.eventId;

    // Segundo envio idêntico com mesma chave -> 200 Idempotente
    const res2 = await request(app)
      .post("/api/v1/webhooks/idempotent-hook")
      .set(headers)
      .send(body);
    expect(res2.status).toBe(200);
    expect(res2.body.eventId).toBe(eventId);
    expect(res2.body.message).toContain("idempotente");

    // Garante que só existe 1 evento no banco
    const count = await Event.countDocuments({ idempotencyKey: "unique-payment-uuid-999" });
    expect(count).toBe(1);
  });

  it("deve retornar 404 se a integração não existir", async () => {
    const res = await request(app)
      .post("/api/v1/webhooks/inexistente")
      .send({ a: 1 });

    expect(res.status).toBe(404);
  });

  it("deve retornar 403 se a integração estiver desabilitada", async () => {
    await request(app)
      .post("/api/v1/integrations")
      .set(adminHeaders)
      .send({
        name: "Hook Desabilitado",
        slug: "disabled-hook",
        enabled: false,
        destination: { url: "https://httpbin.org/post" },
      });

    const res = await request(app)
      .post("/api/v1/webhooks/disabled-hook")
      .send({ a: 1 });

    expect(res.status).toBe(403);
  });
});
