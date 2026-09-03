import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "http";
import request from "supertest";
import app from "../../src/app.js";
import { processEvent } from "../../src/services/eventProcessorService.js";
import { EVENT_STATUS, DELIVERY_STATUS } from "../../src/constants/index.js";
import Delivery from "../../src/models/Delivery.js";
import { clearOAuthCache } from "../../src/services/oauthService.js";

describe("OAuth2 Outbound Authentication (Integration Tests)", () => {
  let mockServer;
  let tokenUrl;
  let resourceUrl;
  let lastAuthHeader = null;

  beforeAll(async () => {
    mockServer = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        if (req.url === "/oauth/token") {
          const params = new URLSearchParams(body);
          if (params.get("client_id") === "oauth_client_id") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                access_token: "jwt_signed_flowbridge_token_999",
                expires_in: 3600,
              })
            );
            return;
          }
          res.writeHead(401);
          res.end();
        } else if (req.url === "/api/secure-resource") {
          lastAuthHeader = req.headers["authorization"];
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true, authorized: true }));
        } else {
          res.writeHead(404);
          res.end();
        }
      });
    });

    await new Promise((resolve) => {
      mockServer.listen(0, () => {
        const port = mockServer.address().port;
        tokenUrl = `http://127.0.0.1:${port}/oauth/token`;
        resourceUrl = `http://127.0.0.1:${port}/api/secure-resource`;
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

  it("deve autenticar automaticamente via OAuth2 e injetar Bearer token na requisição de destino", async () => {
    clearOAuthCache();
    lastAuthHeader = null;

    // 1. Cria integração configurada com OAuth2
    const integrationRes = await request(app)
      .post("/api/v1/integrations")
      .set(adminHeaders)
      .send({
        name: "OAuth2 Protected Integration",
        slug: "oauth-integration",
        destination: {
          url: resourceUrl,
          method: "POST",
          authentication: {
            type: "oauth2",
            tokenUrl,
            clientId: "oauth_client_id",
            clientSecret: "oauth_secret_super_key",
          },
        },
      });

    expect(integrationRes.status).toBe(201);

    // 2. Dispara webhook
    const webhookRes = await request(app)
      .post("/api/v1/webhooks/oauth-integration")
      .send({ test: "oauth_data" });

    expect(webhookRes.status).toBe(202);
    const eventId = webhookRes.body.eventId;

    // 3. Processa o evento
    const processedEvent = await processEvent(eventId);
    expect(processedEvent.status).toBe(EVENT_STATUS.SUCCESS);

    // 4. Valida se a chamada ao destino recebeu o token Bearer gerado pelo OAuth2
    expect(lastAuthHeader).toBe("Bearer jwt_signed_flowbridge_token_999");

    const delivery = await Delivery.findOne({ eventId });
    expect(delivery.status).toBe(DELIVERY_STATUS.SUCCESS);
    expect(delivery.responseStatus).toBe(200);
  });
});
