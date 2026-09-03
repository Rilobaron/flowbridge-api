import { Router } from "express";
import { sendTest } from "../controllers/testController.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

// Habilitado apenas em desenvolvimento e testes
router.post(
  "/test/send",
  (req, res, next) => {
    if (process.env.NODE_ENV === "production") {
      return res.status(404).json({
        success: false,
        message: "Test endpoint is disabled in production.",
      });
    }
    next();
  },
  asyncHandler(sendTest)
);

export default router;