import { Router } from "express";
import {
  createIntegration,
  listIntegrations,
  getIntegrationById,
  updateIntegration,
  deleteIntegration,
} from "../controllers/integrationController.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { adminAuthMiddleware } from "../middlewares/adminAuthMiddleware.js";
import { validate } from "../middlewares/validateMiddleware.js";
import {
  createIntegrationSchema,
  updateIntegrationSchema,
} from "../validators/integrationValidator.js";
import {
  objectIdParamSchema,
  paginationQuerySchema,
} from "../validators/commonValidators.js";

const router = Router();

router.post(
  "/integrations",
  adminAuthMiddleware,
  validate(createIntegrationSchema, "body"),
  asyncHandler(createIntegration)
);

router.get(
  "/integrations",
  adminAuthMiddleware,
  validate(paginationQuerySchema, "query"),
  asyncHandler(listIntegrations)
);

router.get(
  "/integrations/:id",
  adminAuthMiddleware,
  validate(objectIdParamSchema, "params"),
  asyncHandler(getIntegrationById)
);

router.patch(
  "/integrations/:id",
  adminAuthMiddleware,
  validate(objectIdParamSchema, "params"),
  validate(updateIntegrationSchema, "body"),
  asyncHandler(updateIntegration)
);

router.delete(
  "/integrations/:id",
  adminAuthMiddleware,
  validate(objectIdParamSchema, "params"),
  asyncHandler(deleteIntegration)
);

export default router;
