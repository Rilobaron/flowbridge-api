import { Router } from "express";
import { listEventLogs, listAllLogs } from "../controllers/logController.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { adminAuthMiddleware } from "../middlewares/adminAuthMiddleware.js";
import { validate } from "../middlewares/validateMiddleware.js";
import { paginationQuerySchema } from "../validators/commonValidators.js";

const router = Router();

router.get("/events/:eventId/logs", adminAuthMiddleware, asyncHandler(listEventLogs));
router.get("/logs", adminAuthMiddleware, validate(paginationQuerySchema, "query"), asyncHandler(listAllLogs));

export default router;