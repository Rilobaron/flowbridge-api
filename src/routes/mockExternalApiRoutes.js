import { Router } from "express";
import { receiveExternalData } from "../controllers/mockExternalApiController.js";

const router = Router();

router.post("/mock/external-api", receiveExternalData);

export default router;