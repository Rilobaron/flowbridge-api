import { describe, it, expect } from "vitest";
import { getByPath, setByPath, transformPayload } from "../../src/services/mappingService.js";

describe("mappingService (Unit Tests)", () => {
  it("deve recuperar valores aninhados usando dot notation", () => {
    const obj = {
      customer: {
        profile: {
          name: "Maria Silva",
          contacts: {
            email: "maria@example.com",
          },
        },
      },
    };

    expect(getByPath(obj, "customer.profile.name")).toBe("Maria Silva");
    expect(getByPath(obj, "customer.profile.contacts.email")).toBe("maria@example.com");
    expect(getByPath(obj, "customer.nonexistent")).toBeUndefined();
  });

  it("deve definir valores aninhados usando dot notation", () => {
    const target = {};
    setByPath(target, "user.details.email", "joao@example.com");
    setByPath(target, "user.details.name", "João");

    expect(target).toEqual({
      user: {
        details: {
          email: "joao@example.com",
          name: "João",
        },
      },
    });
  });

  it("deve transformar um payload dinamicamente com base em regras", () => {
    const payload = {
      customer: {
        full_name: "Carlos Eduardo",
        email: "carlos@example.com",
        phone: "11988887777",
        address: {
          city: "São Paulo",
          state: "SP",
        },
      },
    };

    const mapping = {
      name: "customer.full_name",
      email: "customer.email",
      phone: "customer.phone",
      "location.city": "customer.address.city",
      origin: "_fixed:flowbridge_crm",
      is_active: "_fixed:true",
    };

    const result = transformPayload(payload, mapping);

    expect(result).toEqual({
      name: "Carlos Eduardo",
      email: "carlos@example.com",
      phone: "11988887777",
      location: {
        city: "São Paulo",
      },
      origin: "flowbridge_crm",
      is_active: true,
    });
  });

  it("deve retornar o payload original se o mapping for nulo ou vazio", () => {
    const payload = { a: 1, b: 2 };
    expect(transformPayload(payload, null)).toEqual(payload);
    expect(transformPayload(payload, {})).toEqual(payload);
  });

  it("deve ignorar propriedades maliciosas de prototype pollution", () => {
    const target = {};
    setByPath(target, "__proto__.polluted", "hacked");
    setByPath(target, "constructor.prototype.polluted", "hacked");

    expect({}.polluted).toBeUndefined();
    expect(target.polluted).toBeUndefined();
  });
});
