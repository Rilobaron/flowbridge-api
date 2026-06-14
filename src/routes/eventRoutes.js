import { Router } from "express";
import {
  listEvents,
  getEventStats,
  getEventById,
  retryEvent,
} from "../controllers/eventController.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.get("/events", asyncHandler(listEvents));
router.get("/events/stats", asyncHandler(getEventStats));
router.get("/events/:eventId", asyncHandler(getEventById));
router.post("/events/:eventId/retry", asyncHandler(retryEvent));

export default router;