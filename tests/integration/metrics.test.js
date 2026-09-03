import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../../src/app.js";

describe("Prometheus Metrics (Integration Tests)", () => {
  it("deve retornar métricas no formato padrão do Prometheus", async () => {
    const res = await request(app).get("/metrics");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");

    const body = res.text;
    expect(body).toContain("flowbridge_uptime_seconds");
    expect(body).toContain("flowbridge_active_integrations");
    expect(body).toContain("flowbridge_events_total");
    expect(body).toContain("nodejs_memory_heap_used_bytes");
  });
});
