import { Router } from "express";
import { receiveWebhook } from "../controllers/webhookController.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.post("/webhook", asyncHandler(receiveWebhook));

export default router;