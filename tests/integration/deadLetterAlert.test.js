import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "http";
import request from "supertest";
import app from "../../src/app.js";
import { processEvent } from "../../src/services/eventProcessorService.js";
import { EVENT_STATUS } from "../../src/constants/index.js";

describe("Dead Letter Alerting (Integration Tests)", () => {
  let mockServer;
  let failingDestUrl;
  let alertWebhookUrl;
  let alertsReceived = [];

  beforeAll(async () => {
    mockServer = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        const parsed = body ? JSON.parse(body) : null;
        if (req.url === "/failing-api") {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Internal crash in destination" }));
        } else if (req.url === "/slack-webhook-alert") {
          alertsReceived.push(parsed);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } else {
          res.writeHead(404);
          res.end();
        }
      });
    });

    await new Promise((resolve) => {
      mockServer.listen(0, () => {
        const port = mockServer.address().port;
        failingDestUrl = `http://127.0.0.1:${port}/failing-api`;
        alertWebhookUrl = `http://127.0.0.1:${port}/slack-webhook-alert`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (mockServer) {
      await new Promise((resolve) => mockServer.close(resolve));
    }
  });

  const adminHeaders = { "X-API-Key": "test_admin_secret_key" };

  it("deve disparar notificação para o webhook de alerta quando um evento for para Dead Letter", async () => {
    alertsReceived = [];

    // 1. Cria integração com alertWebhookUrl e 1 tentativa máxima para falhar direto
    const integrationRes = await request(app)
      .post("/api/v1/integrations")
      .set(adminHeaders)
      .send({
        name: "Integração com Alerta",
        slug: "integration-with-alert",
        alertWebhookUrl,
        destination: {
          url: failingDestUrl,
          method: "POST",
        },
        retryPolicy: {
          enabled: true,
          maxAttempts: 1,
        },
      });

    expect(integrationRes.status).toBe(201);

    // 2. Dispara webhook
    const webhookRes = await request(app)
      .post("/api/v1/webhooks/integration-with-alert")
      .send({ orderId: "12345" });

    expect(webhookRes.status).toBe(202);
    const eventId = webhookRes.body.eventId;

    // 3. Processa evento
    const processedEvent = await processEvent(eventId);
    expect(processedEvent.status).toBe(EVENT_STATUS.DEAD_LETTER);

    // Aguarda ligeiramente para que a promise assíncrona do alerta complete
    await new Promise((resolve) => setTimeout(resolve, 300));

    // 4. Valida se o webhook de alerta recebeu os dados
    expect(alertsReceived).toHaveLength(1);
    const alert = alertsReceived[0];
    expect(alert.text).toContain("[FlowBridge Alert]");
    expect(alert.event.id).toBe(eventId);
    expect(alert.event.attempts).toBe(1);
  });
});
