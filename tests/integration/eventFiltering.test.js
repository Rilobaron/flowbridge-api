import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "http";
import request from "supertest";
import app from "../../src/app.js";
import Delivery from "../../src/models/Delivery.js";
import { processEvent } from "../../src/services/eventProcessorService.js";
import { EVENT_STATUS, DELIVERY_STATUS } from "../../src/constants/index.js";

describe("Event Filtering / Rules Engine (Integration Tests)", () => {
  let mockServer;
  let targetUrl;
  let targetReceived = [];

  beforeAll(async () => {
    mockServer = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        targetReceived.push(body ? JSON.parse(body) : null);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true }));
      });
    });

    await new Promise((resolve) => {
      mockServer.listen(0, () => {
        const port = mockServer.address().port;
        targetUrl = `http://127.0.0.1:${port}/destination`;
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

  it("deve pular a entrega (status SKIPPED) caso o payload não atenda às regras de filtro", async () => {
    targetReceived = [];

    // 1. Cria integração com filtro: aceita apenas plano 'enterprise'
    const integrationRes = await request(app)
      .post("/api/v1/integrations")
      .set(adminHeaders)
      .send({
        name: "Filtro Enterprise Only",
        slug: "filter-enterprise",
        filter: {
          "customer.plan": "enterprise",
        },
        destination: {
          url: targetUrl,
          method: "POST",
        },
      });

    expect(integrationRes.status).toBe(201);

    // 2. Dispara webhook com plano 'starter' (deve ser filtrado / skipped)
    const webhookRes1 = await request(app)
      .post("/api/v1/webhooks/filter-enterprise")
      .send({
        customer: { name: "Carlos", plan: "starter" },
      });

    expect(webhookRes1.status).toBe(202);
    const eventId1 = webhookRes1.body.eventId;

    const event1 = await processEvent(eventId1);
    expect(event1.status).toBe(EVENT_STATUS.SKIPPED);

    // Destino NÃO pode ter recebido nenhuma chamada HTTP
    expect(targetReceived).toHaveLength(0);

    const delivery1 = await Delivery.findOne({ eventId: eventId1 });
    expect(delivery1.status).toBe(DELIVERY_STATUS.SKIPPED);
    expect(delivery1.lastError).toContain("é diferente do esperado");

    // 3. Dispara webhook com plano 'enterprise' (deve ser aprovado e entregue)
    const webhookRes2 = await request(app)
      .post("/api/v1/webhooks/filter-enterprise")
      .send({
        customer: { name: "Beatriz", plan: "enterprise" },
      });

    expect(webhookRes2.status).toBe(202);
    const eventId2 = webhookRes2.body.eventId;

    const event2 = await processEvent(eventId2);
    expect(event2.status).toBe(EVENT_STATUS.SUCCESS);

    // Destino deve ter recebido exatamente 1 chamada HTTP
    expect(targetReceived).toHaveLength(1);
    expect(targetReceived[0].customer.name).toBe("Beatriz");

    const delivery2 = await Delivery.findOne({ eventId: eventId2 });
    expect(delivery2.status).toBe(DELIVERY_STATUS.SUCCESS);
  });
});
