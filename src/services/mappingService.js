/**
 * Obtém o valor em um objeto usando dot notation (ex: 'customer.profile.name')
 */
export function getByPath(obj, path) {
  if (!obj || typeof obj !== "object" || !path) {
    return undefined;
  }

  const keys = Array.isArray(path) ? path : path.split(".");
  let current = obj;

  for (const key of keys) {
    if (current === null || current === undefined) {
      return undefined;
    }
    // Proteção contra prototype pollution
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      return undefined;
    }
    current = current[key];
  }

  return current;
}

/**
 * Define um valor em um objeto usando dot notation (ex: 'user.details.email', 'test@example.com')
 */
export function setByPath(obj, path, value) {
  if (!obj || typeof obj !== "object" || !path) {
    return obj;
  }

  const keys = Array.isArray(path) ? path : path.split(".");

  // Se qualquer chave do caminho for sensível/prototype pollution, aborta a operação
  for (const key of keys) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      return obj;
    }
  }

  let current = obj;

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];

    if (i === keys.length - 1) {
      current[key] = value;
    } else {
      if (
        current[key] === null ||
        current[key] === undefined ||
        typeof current[key] !== "object"
      ) {
        const nextKey = keys[i + 1];
        current[key] = /^\d+$/.test(nextKey) ? [] : {};
      }
      current = current[key];
    }
  }

  return obj;
}

/**
 * Transforma um payload de entrada com base nas regras de mapping configuradas.
 */
export function transformPayload(payload, mappingRules) {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  // Se não houver regras de mapeamento, retorna o payload original
  if (!mappingRules || typeof mappingRules !== "object" || Object.keys(mappingRules).length === 0) {
    return payload;
  }

  const result = {};

  for (const [targetPath, sourceRule] of Object.entries(mappingRules)) {
    // Proteção contra prototype pollution
    if (targetPath === "__proto__" || targetPath === "constructor" || targetPath === "prototype") {
      continue;
    }

    let valueToSet;

    if (typeof sourceRule === "string") {
      if (sourceRule.startsWith("_fixed:")) {
        const fixedVal = sourceRule.slice(7);
        if (fixedVal === "true") valueToSet = true;
        else if (fixedVal === "false") valueToSet = false;
        else if (fixedVal === "null") valueToSet = null;
        else if (!isNaN(Number(fixedVal)) && fixedVal.trim() !== "") valueToSet = Number(fixedVal);
        else valueToSet = fixedVal;
      } else {
        valueToSet = getByPath(payload, sourceRule);
      }
    } else if (typeof sourceRule === "object" && sourceRule !== null) {
      if (sourceRule.type === "fixed") {
        valueToSet = sourceRule.value;
      } else if (sourceRule.type === "path" || sourceRule.path) {
        valueToSet = getByPath(payload, sourceRule.path);
        if (valueToSet === undefined && sourceRule.default !== undefined) {
          valueToSet = sourceRule.default;
        }
      } else {
        valueToSet = transformPayload(payload, sourceRule);
      }
    } else {
      valueToSet = sourceRule;
    }

    if (valueToSet !== undefined) {
      setByPath(result, targetPath, valueToSet);
    }
  }

  return result;
}
