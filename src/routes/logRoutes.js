import { Router } from "express";
import { listEventLogs } from "../controllers/logController.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.get("/events/:eventId/logs", asyncHandler(listEventLogs));

export default router;