import { Router } from "express";
import { sendTest } from "../controllers/testController.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.post("/test/send", asyncHandler(sendTest));

export default router;