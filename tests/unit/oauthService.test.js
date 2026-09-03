import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import http from "http";
import { getOAuthAccessToken, clearOAuthCache } from "../../src/services/oauthService.js";

describe("oauthService (Unit Tests)", () => {
  let mockAuthServer;
  let tokenUrl;
  let requestCount = 0;

  beforeAll(async () => {
    mockAuthServer = http.createServer((req, res) => {
      requestCount++;
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        const params = new URLSearchParams(body);
        if (params.get("client_id") === "valid_id" && params.get("client_secret") === "valid_secret") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              access_token: `mock_jwt_token_${requestCount}`,
              token_type: "Bearer",
              expires_in: 3600,
            })
          );
        } else {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "invalid_client" }));
        }
      });
    });

    await new Promise((resolve) => {
      mockAuthServer.listen(0, () => {
        const port = mockAuthServer.address().port;
        tokenUrl = `http://127.0.0.1:${port}/oauth/token`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (mockAuthServer) {
      await new Promise((resolve) => mockAuthServer.close(resolve));
    }
  });

  beforeEach(() => {
    clearOAuthCache();
    requestCount = 0;
  });

  it("deve obter access token via client credentials", async () => {
    const token = await getOAuthAccessToken({
      tokenUrl,
      clientId: "valid_id",
      clientSecret: "valid_secret",
      scope: "read:leads write:leads",
    });

    expect(token).toBe("mock_jwt_token_1");
    expect(requestCount).toBe(1);
  });

  it("deve reutilizar token em cache sem fazer nova chamada HTTP ao tokenUrl", async () => {
    // 1ª chamada -> faz request
    const token1 = await getOAuthAccessToken({
      tokenUrl,
      clientId: "valid_id",
      clientSecret: "valid_secret",
    });

    // 2ª chamada -> pega do cache
    const token2 = await getOAuthAccessToken({
      tokenUrl,
      clientId: "valid_id",
      clientSecret: "valid_secret",
    });

    expect(token1).toBe("mock_jwt_token_1");
    expect(token2).toBe("mock_jwt_token_1");
    expect(requestCount).toBe(1); // Continua 1 porque usou cache
  });

  it("deve lançar erro se as credenciais OAuth2 forem rejeitadas", async () => {
    await expect(
      getOAuthAccessToken({
        tokenUrl,
        clientId: "wrong_id",
        clientSecret: "wrong_secret",
      })
    ).rejects.toThrow(/Falha na autenticação OAuth2/);
  });
});
