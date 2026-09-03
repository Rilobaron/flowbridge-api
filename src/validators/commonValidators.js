import { z } from "zod";

export const webhookParamsSchema = z.object({
  slug: z.string().min(1, "Slug da integração é obrigatório"),
});

export const legacyWebhookBodySchema = z.object({
  source: z.string().min(1, "source é obrigatório"),
  eventType: z.string().min(1, "eventType é obrigatório"),
  payload: z.record(z.any()),
});

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().optional(),
  status: z.string().optional(),
  source: z.string().optional(),
  eventType: z.string().optional(),
  integrationId: z.string().optional(),
});

export const objectIdParamSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, "ID deve ser um ObjectId válido do MongoDB"),
});

export const eventIdParamSchema = z.object({
  eventId: z.string().regex(/^[0-9a-fA-F]{24}$/, "eventId deve ser um ObjectId válido do MongoDB"),
});

export const retryEventBodySchema = z.object({
  simulateFailure: z.boolean().optional(),
});
