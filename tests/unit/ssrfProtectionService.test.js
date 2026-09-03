import { describe, it, expect } from "vitest";
import { isPrivateIp, validateDestinationUrl } from "../../src/services/ssrfProtectionService.js";

describe("ssrfProtectionService (Unit Tests)", () => {
  it("deve identificar corretamente endereços IPs privados e loopback", () => {
    expect(isPrivateIp("127.0.0.1")).toBe(true);
    expect(isPrivateIp("10.0.0.1")).toBe(true);
    expect(isPrivateIp("172.16.0.1")).toBe(true);
    expect(isPrivateIp("192.168.1.1")).toBe(true);
    expect(isPrivateIp("169.254.169.254")).toBe(true); // AWS/Cloud metadata
    expect(isPrivateIp("::1")).toBe(true);
    expect(isPrivateIp("0.0.0.0")).toBe(true);

    // IPs públicos reais
    expect(isPrivateIp("8.8.8.8")).toBe(false);
    expect(isPrivateIp("1.1.1.1")).toBe(false);
  });

  it("deve bloquear URLs com protocolos inválidos (file://, ftp://)", async () => {
    await expect(validateDestinationUrl("file:///etc/passwd")).rejects.toThrow();
    await expect(validateDestinationUrl("ftp://example.com/data")).rejects.toThrow();
  });

  it("deve bloquear localhost e IPs privados quando ALLOW_LOCAL_DESTINATIONS=false", async () => {
    const originalEnv = process.env.ALLOW_LOCAL_DESTINATIONS;
    const originalNodeEnv = process.env.NODE_ENV;

    process.env.ALLOW_LOCAL_DESTINATIONS = "false";
    process.env.NODE_ENV = "production";

    try {
      await expect(validateDestinationUrl("http://localhost:8080/webhook")).rejects.toThrow(
        /bloqueado por proteção SSRF/
      );
      await expect(validateDestinationUrl("http://127.0.0.1:3000/api")).rejects.toThrow(
        /bloqueado por proteção SSRF/
      );
      await expect(validateDestinationUrl("http://169.254.169.254/latest/meta-data")).rejects.toThrow(
        /bloqueado por proteção SSRF/
      );
    } finally {
      process.env.ALLOW_LOCAL_DESTINATIONS = originalEnv;
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it("deve permitir URLs públicas válidas (http/https)", async () => {
    const isValid = await validateDestinationUrl("https://httpbin.org/post");
    expect(isValid).toBe(true);
  });
});
