import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "http";
import request from "supertest";
import app from "../../src/app.js";
import Delivery from "../../src/models/Delivery.js";
import DeliveryAttempt from "../../src/models/DeliveryAttempt.js";
import { processEvent } from "../../src/services/eventProcessorService.js";
import { EVENT_STATUS, DELIVERY_STATUS } from "../../src/constants/index.js";

describe("End-to-End Processing (Integration Tests)", () => {
  let mockServer;
  let mockServerPort;
  let mockServerUrl;
  let shouldFail = false;
  let receivedRequests = [];

  beforeAll(async () => {
    mockServer = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        receivedRequests.push({
          url: req.url,
          method: req.method,
          headers: req.headers,
          body: body ? JSON.parse(body) : null,
        });

        if (shouldFail) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Simulated Internal Server Error" }));
        } else {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true, message: "Received by mock destination" }));
        }
      });
    });

    await new Promise((resolve) => {
      mockServer.listen(0, () => {
        mockServerPort = mockServer.address().port;
        mockServerUrl = `http://127.0.0.1:${mockServerPort}/destination-api`;
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

  it("deve executar o fluxo completo: Webhook -> Transformação JSON -> Destino 200 -> Success", async () => {
    shouldFail = false;
    receivedRequests = [];

    // 1. Cria a Integração com regras de mapping
    const integrationRes = await request(app)
      .post("/api/v1/integrations")
      .set(adminHeaders)
      .send({
        name: "E2E Sucesso Integration",
        slug: "e2e-success",
        destination: {
          url: mockServerUrl,
          method: "POST",
          headers: { "X-Custom-Client": "FlowBridge-E2E" },
          authentication: {
            type: "bearer",
            token: "e2e_secret_token_789",
          },
        },
        mapping: {
          full_name: "customer.profile.name",
          contact_email: "customer.profile.email",
          origin_system: "_fixed:meta_ads_campaign",
        },
      });

    expect(integrationRes.status).toBe(201);

    // 2. Envia o Webhook
    const webhookRes = await request(app)
      .post("/api/v1/webhooks/e2e-success")
      .send({
        customer: {
          profile: {
            name: "Lucas Fernandes",
            email: "lucas@example.com",
          },
        },
      });

    expect(webhookRes.status).toBe(202);
    const eventId = webhookRes.body.eventId;

    // 3. Processa o Evento
    const processedEvent = await processEvent(eventId);

    expect(processedEvent.status).toBe(EVENT_STATUS.SUCCESS);
    expect(processedEvent.transformedPayload).toEqual({
      full_name: "Lucas Fernandes",
      contact_email: "lucas@example.com",
      origin_system: "meta_ads_campaign",
    });

    // 4. Valida se a requisição chegou ao destino com os dados mapeados e cabeçalhos corretos
    expect(receivedRequests.length).toBe(1);
    const reqReceived = receivedRequests[0];
    expect(reqReceived.headers["x-custom-client"]).toBe("FlowBridge-E2E");
    expect(reqReceived.headers["authorization"]).toBe("Bearer e2e_secret_token_789");
    expect(reqReceived.body).toEqual({
      full_name: "Lucas Fernandes",
      contact_email: "lucas@example.com",
      origin_system: "meta_ads_campaign",
    });

    // 5. Valida registros de Delivery e DeliveryAttempt no banco
    const delivery = await Delivery.findOne({ eventId });
    expect(delivery).toBeDefined();
    expect(delivery.status).toBe(DELIVERY_STATUS.SUCCESS);
    expect(delivery.responseStatus).toBe(200);

    const attempts = await DeliveryAttempt.find({ eventId });
    expect(attempts.length).toBe(1);
    expect(attempts[0].success).toBe(true);
    expect(attempts[0].response.status).toBe(200);
  });

  it("deve lidar com falhas do destino (500), retries e transição para Dead Letter", async () => {
    shouldFail = true; // Simula falha 500 no destino
    receivedRequests = [];

    // Cria integração com política de 2 tentativas e delay curto
    const integrationRes = await request(app)
      .post("/api/v1/integrations")
      .set(adminHeaders)
      .send({
        name: "E2E Falha Integration",
        slug: "e2e-fail",
        destination: { url: mockServerUrl, method: "POST" },
        retryPolicy: {
          enabled: true,
          maxAttempts: 2,
          initialDelay: 100,
          multiplier: 1,
        },
      });

    expect(integrationRes.status).toBe(201);

    // Envia webhook
    const webhookRes = await request(app)
      .post("/api/v1/webhooks/e2e-fail")
      .send({ test: "data" });

    const eventId = webhookRes.body.eventId;

    // 1ª Tentativa de Processamento -> deve entrar em RETRYING
    const eventAfterAttempt1 = await processEvent(eventId);
    expect(eventAfterAttempt1.status).toBe(EVENT_STATUS.RETRYING);
    expect(eventAfterAttempt1.attempts).toBe(1);

    // 2ª Tentativa de Processamento -> esgota tentativas e vira DEAD_LETTER
    const eventAfterAttempt2 = await processEvent(eventId);
    expect(eventAfterAttempt2.status).toBe(EVENT_STATUS.DEAD_LETTER);
    expect(eventAfterAttempt2.attempts).toBe(2);

    const delivery = await Delivery.findOne({ eventId });
    expect(delivery.status).toBe(DELIVERY_STATUS.DEAD_LETTER);

    // 3. Agora o destino se recupera e o operador faz retry manual
    shouldFail = false; // Destino volta a responder 200

    await request(app)
      .post(`/api/v1/events/${eventId}/retry`)
      .set(adminHeaders);

    const eventRetried = await processEvent(eventId);
    expect(eventRetried.status).toBe(EVENT_STATUS.SUCCESS);

    const updatedDelivery = await Delivery.findOne({ eventId });
    expect(updatedDelivery.status).toBe(DELIVERY_STATUS.SUCCESS);
  });
});
