import { Router } from "express";
import { receiveExternalData } from "../controllers/mockExternalApiController.js";

const router = Router();

// Habilitado apenas em desenvolvimento e testes
router.post("/mock/external-api", (req, res, next) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({
      success: false,
      message: "Mock external API is disabled in production.",
    });
  }
  return receiveExternalData(req, res, next);
});

export default router;