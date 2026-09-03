import { z } from "zod";
import {
  INBOUND_AUTH_TYPE,
  OUTBOUND_AUTH_TYPE,
  HTTP_METHODS,
} from "../constants/index.js";

const retryPolicySchema = z.object({
  enabled: z.boolean().optional(),
  maxAttempts: z.number().int().min(1).max(10).optional(),
  initialDelay: z.number().int().min(100).max(60000).optional(),
  multiplier: z.number().min(1).max(10).optional(),
  maxDelay: z.number().int().min(1000).max(3600000).optional(),
});

const sourceSchema = z.object({
  authenticationType: z.enum(Object.values(INBOUND_AUTH_TYPE)).default(INBOUND_AUTH_TYPE.NONE),
  secret: z.string().nullable().optional(),
  headerName: z.string().nullable().optional(),
});

const destinationAuthSchema = z.object({
  type: z.enum(Object.values(OUTBOUND_AUTH_TYPE)).default(OUTBOUND_AUTH_TYPE.NONE),
  token: z.string().nullable().optional(),
  username: z.string().nullable().optional(),
  password: z.string().nullable().optional(),
  apiKey: z.string().nullable().optional(),
  apiKeyHeader: z.string().default("X-API-Key").optional(),
});

const destinationSchema = z.object({
  url: z.string().url("URL de destino inválida"),
  method: z.enum(HTTP_METHODS).default("POST"),
  headers: z.record(z.string()).optional(),
  authentication: destinationAuthSchema.optional(),
});

export const createIntegrationSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").max(100),
  slug: z
    .string()
    .min(2, "Slug deve ter pelo menos 2 caracteres")
    .max(100)
    .regex(/^[a-z0-9-_]+$/, "Slug deve conter apenas letras minúsculas, números, hífens e sublinhados"),
  description: z.string().max(500).optional(),
  enabled: z.boolean().default(true),
  source: sourceSchema.optional(),
  destination: destinationSchema,
  mapping: z.record(z.any()).nullable().optional(),
  retryPolicy: retryPolicySchema.optional(),
  timeout: z.number().int().min(500).max(60000).default(5000),
});

export const updateIntegrationSchema = createIntegrationSchema.partial();
