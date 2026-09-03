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
  // Campos OAuth2
  tokenUrl: z.string().url().nullable().optional(),
  clientId: z.string().nullable().optional(),
  clientSecret: z.string().nullable().optional(),
  scope: z.string().nullable().optional(),
});

const destinationItemSchema = z.object({
  name: z.string().trim().default("primary").optional(),
  url: z.string().url("URL de destino inválida"),
  method: z.enum(HTTP_METHODS).default("POST"),
  headers: z.record(z.string()).optional(),
  mapping: z.record(z.any()).nullable().optional(),
  authentication: destinationAuthSchema.optional(),
  timeout: z.number().int().min(500).max(60000).optional(),
});

export const createIntegrationSchema = z
  .object({
    name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").max(100),
    slug: z
      .string()
      .min(2, "Slug deve ter pelo menos 2 caracteres")
      .max(100)
      .regex(/^[a-z0-9-_]+$/, "Slug deve conter apenas letras minúsculas, números, hífens e sublinhados"),
    description: z.string().max(500).optional(),
    enabled: z.boolean().default(true),
    source: sourceSchema.optional(),
    // Suporte tanto a destination individual quanto destinations array
    destination: destinationItemSchema.optional(),
    destinations: z.array(destinationItemSchema).min(1).max(10).optional(),
    mapping: z.record(z.any()).nullable().optional(),
    retryPolicy: retryPolicySchema.optional(),
    timeout: z.number().int().min(500).max(60000).default(5000),
  })
  .refine((data) => data.destination || (data.destinations && data.destinations.length > 0), {
    message: "É necessário fornecer ao menos um destino em 'destination' ou 'destinations'.",
    path: ["destination"],
  });

export const updateIntegrationSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  slug: z.string().min(2).max(100).regex(/^[a-z0-9-_]+$/).optional(),
  description: z.string().max(500).optional(),
  enabled: z.boolean().optional(),
  source: sourceSchema.optional(),
  destination: destinationItemSchema.optional(),
  destinations: z.array(destinationItemSchema).min(1).max(10).optional(),
  mapping: z.record(z.any()).nullable().optional(),
  retryPolicy: retryPolicySchema.optional(),
  timeout: z.number().int().min(500).max(60000).optional(),
});
