import { Router } from "express";
import {
  listEvents,
  getEventStats,
  getEventById,
  retryEvent,
} from "../controllers/eventController.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { adminAuthMiddleware } from "../middlewares/adminAuthMiddleware.js";
import { validate } from "../middlewares/validateMiddleware.js";
import {
  paginationQuerySchema,
  retryEventBodySchema,
} from "../validators/commonValidators.js";

const router = Router();

router.get("/events", adminAuthMiddleware, validate(paginationQuerySchema, "query"), asyncHandler(listEvents));
router.get("/events/stats", adminAuthMiddleware, asyncHandler(getEventStats));
router.get("/events/:eventId", adminAuthMiddleware, asyncHandler(getEventById));
router.post(
  "/events/:eventId/retry",
  adminAuthMiddleware,
  validate(retryEventBodySchema, "body"),
  asyncHandler(retryEvent)
);

export default router;