import { Router } from "express";
import {
  receiveDynamicWebhook,
  receiveLegacyWebhook,
} from "../controllers/webhookController.js";
import { webhookAuthMiddleware } from "../middlewares/webhookAuthMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

// Webhook dinâmico baseado na Integration
router.post(
  "/webhooks/:slug",
  asyncHandler(webhookAuthMiddleware),
  asyncHandler(receiveDynamicWebhook)
);

// Rota legada para retrocompatibilidade
router.post("/webhook", asyncHandler(receiveLegacyWebhook));

export default router;