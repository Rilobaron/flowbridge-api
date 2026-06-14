import express from "express";

import webhookRoutes from "./routes/webhookRoutes.js";
import eventRoutes from "./routes/eventRoutes.js";
import mockExternalApiRoutes from "./routes/mockExternalApiRoutes.js";
import logRoutes from "./routes/logRoutes.js";
import testRoutes from "./routes/testRoutes.js";

import { notFoundMiddleware } from "./middlewares/notFoundMiddleware.js";
import { errorMiddleware } from "./middlewares/errorMiddleware.js";

const app = express();

app.use(express.json());

app.get("/health", (req, res) => {
  return res.status(200).json({
    status: "ok",
    message: "FlowBridge API is running",
  });
});

app.use(webhookRoutes);
app.use(eventRoutes);
app.use(mockExternalApiRoutes);
app.use(logRoutes);
app.use(testRoutes);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;