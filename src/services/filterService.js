import { getByPath } from "./mappingService.js";

/**
 * Avalia uma única condição contra o payload
 */
export function evaluateCondition(payload, condition) {
  if (!condition || !condition.field) return true;

  const actualValue = getByPath(payload, condition.field);
  const operator = (condition.operator || "equals").toLowerCase();
  const expectedValue = condition.value;

  switch (operator) {
    case "equals":
    case "eq":
      if (actualValue === null || actualValue === undefined) {
        return expectedValue === null || expectedValue === undefined;
      }
      return String(actualValue) === String(expectedValue);

    case "not_equals":
    case "neq":
      if (actualValue === null || actualValue === undefined) {
        return expectedValue !== null && expectedValue !== undefined;
      }
      return String(actualValue) !== String(expectedValue);

    case "contains":
      if (typeof actualValue === "string") {
        return actualValue.toLowerCase().includes(String(expectedValue).toLowerCase());
      }
      if (Array.isArray(actualValue)) {
        return actualValue.some((v) => String(v) === String(expectedValue));
      }
      return false;

    case "greater_than":
    case "gt":
      return Number(actualValue) > Number(expectedValue);

    case "greater_than_or_equal":
    case "gte":
      return Number(actualValue) >= Number(expectedValue);

    case "less_than":
    case "lt":
      return Number(actualValue) < Number(expectedValue);

    case "less_than_or_equal":
    case "lte":
      return Number(actualValue) <= Number(expectedValue);

    case "in":
      if (Array.isArray(expectedValue)) {
        return expectedValue.some((v) => String(v) === String(actualValue));
      }
      return false;

    case "not_in":
      if (Array.isArray(expectedValue)) {
        return !expectedValue.some((v) => String(v) === String(actualValue));
      }
      return true;

    case "exists":
      return expectedValue
        ? actualValue !== undefined && actualValue !== null
        : actualValue === undefined || actualValue === null;

    default:
      return String(actualValue) === String(expectedValue);
  }
}

/**
 * Avalia um filtro de regras completo contra o payload.
 * Suporta objeto simples { "campo": "valor" } ou estrutura com logic e conditions.
 */
export function matchesFilter(payload, filter) {
  if (!filter || typeof filter !== "object" || Object.keys(filter).length === 0) {
    return { matches: true, reason: null };
  }

  // 1. Formato avançado com lista de condições: { logic: 'and'|'or', conditions: [...] }
  if (Array.isArray(filter.conditions)) {
    const logic = (filter.logic || "and").toLowerCase();

    if (logic === "or") {
      const anyMatch = filter.conditions.some((cond) => evaluateCondition(payload, cond));
      return {
        matches: anyMatch,
        reason: anyMatch ? null : "Nenhuma das condições do filtro (OR) foi atendida.",
      };
    }

    // Default 'and': todas devem passar
    for (const cond of filter.conditions) {
      const ok = evaluateCondition(payload, cond);
      if (!ok) {
        return {
          matches: false,
          reason: `Condição não atendida: campo '${cond.field}' não satisfez o operador '${cond.operator || "equals"}'.`,
        };
      }
    }
    return { matches: true, reason: null };
  }

  // 2. Formato simples chave/valor: { "campo": "esperado" }
  for (const [field, expected] of Object.entries(filter)) {
    if (field === "logic" || field === "conditions") continue;

    const actual = getByPath(payload, field);
    if (String(actual) !== String(expected)) {
      return {
        matches: false,
        reason: `Valor do campo '${field}' ('${actual}') é diferente do esperado ('${expected}').`,
      };
    }
  }

  return { matches: true, reason: null };
}
