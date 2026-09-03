import { describe, it, expect } from "vitest";
import { evaluateCondition, matchesFilter } from "../../src/services/filterService.js";

describe("filterService (Unit Tests)", () => {
  const samplePayload = {
    customer: {
      name: "Ana Paula",
      plan: "enterprise",
      age: 32,
      country: "BR",
      tags: ["vip", "partner"],
    },
    transaction: {
      amount: 250.5,
      status: "approved",
    },
  };

  describe("evaluateCondition", () => {
    it("deve avaliar operador equals / eq", () => {
      expect(
        evaluateCondition(samplePayload, { field: "customer.plan", operator: "equals", value: "enterprise" })
      ).toBe(true);
      expect(
        evaluateCondition(samplePayload, { field: "customer.plan", operator: "equals", value: "starter" })
      ).toBe(false);
    });

    it("deve avaliar operadores numéricos gt, gte, lt, lte", () => {
      expect(
        evaluateCondition(samplePayload, { field: "transaction.amount", operator: "gt", value: 200 })
      ).toBe(true);
      expect(
        evaluateCondition(samplePayload, { field: "transaction.amount", operator: "lt", value: 100 })
      ).toBe(false);
      expect(
        evaluateCondition(samplePayload, { field: "customer.age", operator: "gte", value: 32 })
      ).toBe(true);
    });

    it("deve avaliar operador in e not_in", () => {
      expect(
        evaluateCondition(samplePayload, { field: "customer.country", operator: "in", value: ["BR", "PT"] })
      ).toBe(true);
      expect(
        evaluateCondition(samplePayload, { field: "customer.country", operator: "in", value: ["US", "CA"] })
      ).toBe(false);
      expect(
        evaluateCondition(samplePayload, { field: "customer.country", operator: "not_in", value: ["US", "CA"] })
      ).toBe(true);
    });

    it("deve avaliar operador contains", () => {
      expect(
        evaluateCondition(samplePayload, { field: "customer.tags", operator: "contains", value: "vip" })
      ).toBe(true);
      expect(
        evaluateCondition(samplePayload, { field: "customer.name", operator: "contains", value: "Paula" })
      ).toBe(true);
    });

    it("deve avaliar operador exists", () => {
      expect(
        evaluateCondition(samplePayload, { field: "transaction.amount", operator: "exists", value: true })
      ).toBe(true);
      expect(
        evaluateCondition(samplePayload, { field: "nonexistent.field", operator: "exists", value: true })
      ).toBe(false);
    });
  });

  describe("matchesFilter", () => {
    it("deve retornar matches: true se o filtro estiver vazio", () => {
      expect(matchesFilter(samplePayload, null).matches).toBe(true);
      expect(matchesFilter(samplePayload, {}).matches).toBe(true);
    });

    it("deve avaliar filtro simples chave-valor", () => {
      const filterMatch = { "customer.country": "BR", "transaction.status": "approved" };
      expect(matchesFilter(samplePayload, filterMatch).matches).toBe(true);

      const filterNoMatch = { "customer.country": "US" };
      expect(matchesFilter(samplePayload, filterNoMatch).matches).toBe(false);
    });

    it("deve avaliar filtro avançado com lógica AND", () => {
      const filter = {
        logic: "and",
        conditions: [
          { field: "transaction.amount", operator: "gt", value: 100 },
          { field: "customer.plan", operator: "equals", value: "enterprise" },
        ],
      };
      expect(matchesFilter(samplePayload, filter).matches).toBe(true);
    });

    it("deve avaliar filtro avançado com lógica OR", () => {
      const filter = {
        logic: "or",
        conditions: [
          { field: "customer.plan", operator: "equals", value: "starter" },
          { field: "customer.country", operator: "equals", value: "BR" },
        ],
      };
      expect(matchesFilter(samplePayload, filter).matches).toBe(true);
    });
  });
});
