import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../../src/app.js";
import Event from "../../src/models/Event.js";
import { EVENT_STATUS } from "../../src/constants/index.js";

describe("Events API (Integration Tests)", () => {
  const adminHeaders = { "X-API-Key": "test_admin_secret_key" };

  it("deve listar eventos e calcular estatísticas com sucesso", async () => {
    // Cria alguns eventos para teste
    await Event.create([
      { source: "app-1", eventType: "order.created", payload: { id: 1 }, status: EVENT_STATUS.SUCCESS },
      { source: "app-1", eventType: "order.created", payload: { id: 2 }, status: EVENT_STATUS.DEAD_LETTER },
      { source: "app-2", eventType: "lead.created", payload: { id: 3 }, status: EVENT_STATUS.QUEUED },
    ]);

    // Listagem paginada
    const listRes = await request(app)
      .get("/api/v1/events?page=1&limit=10")
      .set(adminHeaders);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(3);
    expect(listRes.body.pagination.total).toBe(3);

    // Estatísticas
    const statsRes = await request(app)
      .get("/api/v1/events/stats")
      .set(adminHeaders);

    expect(statsRes.status).toBe(200);
    expect(statsRes.body.data.total).toBe(3);
    expect(statsRes.body.data.status.success).toBe(1);
    expect(statsRes.body.data.status.dead_letter).toBe(1);
    expect(statsRes.body.data.status.queued).toBe(1);
    expect(statsRes.body.data.successRate).toBeCloseTo(33.33, 1);
  });

  it("deve buscar detalhes do evento por ID", async () => {
    const event = await Event.create({
      source: "app-test",
      eventType: "test.event",
      payload: { item: "book" },
      status: EVENT_STATUS.SUCCESS,
    });

    const res = await request(app)
      .get(`/api/v1/events/${event._id}`)
      .set(adminHeaders);

    expect(res.status).toBe(200);
    expect(res.body.data._id).toBe(event._id.toString());
    expect(res.body.data.status).toBe(EVENT_STATUS.SUCCESS);
  });

  it("deve solicitar retry manual de um evento Dead Letter", async () => {
    const event = await Event.create({
      source: "app-test",
      eventType: "test.event",
      payload: { item: "book" },
      status: EVENT_STATUS.DEAD_LETTER,
      attempts: 3,
      lastError: "Connection timeout",
    });

    const res = await request(app)
      .post(`/api/v1/events/${event._id}/retry`)
      .set(adminHeaders)
      .send({ simulateFailure: false });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe(EVENT_STATUS.QUEUED);

    const updated = await Event.findById(event._id);
    expect(updated.status).toBe(EVENT_STATUS.QUEUED);
  });
});
