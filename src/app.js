import express from "express";
import { securityHeaders, corsMiddleware, apiLimiter } from "./middlewares/securityMiddleware.js";
import { correlationMiddleware } from "./middlewares/correlationMiddleware.js";
import { notFoundMiddleware } from "./middlewares/notFoundMiddleware.js";
import { errorMiddleware } from "./middlewares/errorMiddleware.js";
import { healthCheck, readinessCheck } from "./controllers/healthController.js";
import { setupSwagger } from "./docs/swagger.js";

import integrationRoutes from "./routes/integrationRoutes.js";
import webhookRoutes from "./routes/webhookRoutes.js";
import eventRoutes from "./routes/eventRoutes.js";
import logRoutes from "./routes/logRoutes.js";
import mockExternalApiRoutes from "./routes/mockExternalApiRoutes.js";
import testRoutes from "./routes/testRoutes.js";

const app = express();

// 1. Segurança e Rate Limiting
app.use(securityHeaders);
app.use(corsMiddleware);
app.use(apiLimiter);

// 2. Rastreabilidade com Correlation ID
app.use(correlationMiddleware);

// 3. Body parser com captura de rawBody para HMAC e limite de payload
const maxBodySize = process.env.BODY_SIZE_LIMIT || "2mb";
app.use(
  express.json({
    limit: maxBodySize,
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: maxBodySize }));

// 4. Health e Readiness Check
app.get("/health", healthCheck);
app.get("/ready", readinessCheck);

// 5. Documentação Swagger OpenAPI 3.0
setupSwagger(app);

// 6. Rotas Versionadas API v1
const apiV1Router = express.Router();
apiV1Router.use(integrationRoutes);
apiV1Router.use(webhookRoutes);
apiV1Router.use(eventRoutes);
apiV1Router.use(logRoutes);

app.use("/api/v1", apiV1Router);

// 7. Retrocompatibilidade para rotas legadas na raiz
app.use(webhookRoutes);
app.use(eventRoutes);
app.use(logRoutes);
app.use(mockExternalApiRoutes);
app.use(testRoutes);

// 8. Tratamento de rotas inexistentes e erros
app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;