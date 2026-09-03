import { Router } from "express";
import { getPrometheusMetrics } from "../controllers/metricsController.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

// Endpoint público de métricas para scraping do Prometheus
router.get("/metrics", asyncHandler(getPrometheusMetrics));

export default router;
