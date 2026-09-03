import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "http";
import request from "supertest";
import app from "../../src/app.js";
import Delivery from "../../src/models/Delivery.js";
import { processEvent } from "../../src/services/eventProcessorService.js";
import { EVENT_STATUS, DELIVERY_STATUS } from "../../src/constants/index.js";

describe("Fan-out / Múltiplos Destinos (Integration Tests)", () => {
  let mockServer;
  let dest1Url;
  let dest2Url;
  let dest1Requests = [];
  let dest2Requests = [];

  beforeAll(async () => {
    mockServer = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        const parsed = body ? JSON.parse(body) : null;
        if (req.url === "/dest-crm") {
          dest1Requests.push(parsed);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "crm_ok" }));
        } else if (req.url === "/dest-datalake") {
          dest2Requests.push(parsed);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "datalake_ok" }));
        } else {
          res.writeHead(404);
          res.end();
        }
      });
    });

    await new Promise((resolve) => {
      mockServer.listen(0, () => {
        const port = mockServer.address().port;
        dest1Url = `http://127.0.0.1:${port}/dest-crm`;
        dest2Url = `http://127.0.0.1:${port}/dest-datalake`;
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

  it("deve entregar webhook para múltiplos destinos simultaneamente (Fan-out)", async () => {
    dest1Requests = [];
    dest2Requests = [];

    // 1. Cria Integração com 2 destinos e mappings customizados por destino
    const integrationRes = await request(app)
      .post("/api/v1/integrations")
      .set(adminHeaders)
      .send({
        name: "Fanout CRM e DataLake",
        slug: "fanout-crm-datalake",
        destinations: [
          {
            name: "CRM",
            url: dest1Url,
            method: "POST",
            mapping: {
              lead_name: "customer.name",
              lead_email: "customer.email",
              target_system: "_fixed:crm",
            },
          },
          {
            name: "DataLake",
            url: dest2Url,
            method: "POST",
            mapping: {
              raw_name: "customer.name",
              raw_email: "customer.email",
              target_system: "_fixed:datalake",
            },
          },
        ],
      });

    expect(integrationRes.status).toBe(201);
    expect(integrationRes.body.data.destinations).toHaveLength(2);

    // 2. Dispara webhook
    const webhookRes = await request(app)
      .post("/api/v1/webhooks/fanout-crm-datalake")
      .send({
        customer: {
          name: "Roberto Dias",
          email: "roberto@example.com",
        },
      });

    expect(webhookRes.status).toBe(202);
    const eventId = webhookRes.body.eventId;

    // 3. Processa o evento com Fan-out
    const processedEvent = await processEvent(eventId);

    expect(processedEvent.status).toBe(EVENT_STATUS.SUCCESS);

    // 4. Valida se os dois destinos receberam seus respectivos dados
    expect(dest1Requests).toHaveLength(1);
    expect(dest1Requests[0]).toEqual({
      lead_name: "Roberto Dias",
      lead_email: "roberto@example.com",
      target_system: "crm",
    });

    expect(dest2Requests).toHaveLength(1);
    expect(dest2Requests[0]).toEqual({
      raw_name: "Roberto Dias",
      raw_email: "roberto@example.com",
      target_system: "datalake",
    });

    // 5. Valida se foram criados 2 registros de Delivery com status SUCCESS
    const deliveries = await Delivery.find({ eventId });
    expect(deliveries).toHaveLength(2);
    expect(deliveries.every((d) => d.status === DELIVERY_STATUS.SUCCESS)).toBe(true);
  });
});
