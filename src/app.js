import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { isDatabaseConnected } from "./config/database.js";
import { createApiRouter } from "./routes/index.js";
import { errorHandler, notFound } from "./middleware/error-handler.js";
import { createApiLimiter } from "./middleware/rate-limiter-redis.js";

// Verification links contain a temporary secret; never put their query string in HTTP logs.
morgan.token("url", (req) =>
  /^\/api\/auth\/(?:verify-email|verifyMail)(?:\?|$)/.test(req.originalUrl)
    ? req.originalUrl.split("?")[0]
    : req.originalUrl,
);
morgan.token("referrer", (req) => {
  const referrer = req.headers.referer ?? req.headers.referrer;
  return /\/api\/auth\/(?:verify-email|verifyMail)(?:\?|$)/.test(referrer)
    ? referrer.split("?")[0]
    : referrer;
});

export function createApp(
  config,
  { databaseConnected = isDatabaseConnected } = {},
) {
  const app = express();
  app.locals.authConfig = {
    jwtSecret: config.jwtSecret,
    jwtExpiresIn: config.jwtExpiresIn,
  };
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: config.clientOrigin, credentials: true }));
  if (config.nodeEnv !== "test")
    app.use(morgan(config.nodeEnv === "production" ? "combined" : "dev"));
  app.use(express.json({ limit: "1mb" }));
  if (config.redisUrl) {
    const limiter = createApiLimiter();
    app.use("/api", (req, res, next) =>
      req.path === "/health" ? next() : limiter(req, res, next),
    );
  }
  app.use("/api", createApiRouter(databaseConnected, config));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
