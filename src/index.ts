import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { config } from "dotenv";
import cron from "node-cron";
import { checkEnvironmentVariables, handleResponse } from "./utils";
import {
  bettermodeWebhookRouter,
  dynamicBlockRouter,
} from "./routers";
import { Logger } from "@tribeplatform/node-logger";
import { BettermodeClient } from "@clients";
import { BadgeOrchestrationService } from "./services/badge-orchestration.service";

// Increase max listeners to prevent warnings from Logger instances
// Each Logger instance may add process listeners
process.setMaxListeners(25);

// Load environment variables
config();
checkEnvironmentVariables();

const { LOGGING_APP_NAME, LOGGING_APP_KEY, NODE_APP_PORT } = process.env;

const logger = new Logger({
  applicationName: LOGGING_APP_KEY!,
  context: "index",
});

BettermodeClient.getNetworkAppInstallations().then((networkIds) => {
  const orchestrationService = BadgeOrchestrationService.getInstance();
  networkIds.forEach((networkId) => {
    orchestrationService.handleAppInstalled(networkId);
  });
});

const app = express();

// Exclude webhook routes from JSON parsing to preserve raw body for signature verification
app.use((req, res, next) => {
  if (req.path.startsWith("/webhook/")) {
    return next();
  }
  express.json()(req, res, next);
});
app.use(express.urlencoded({ extended: true }));
app.use(cors());

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: `${LOGGING_APP_NAME} Server is up and running! ${new Date().toISOString()}`,
  });
});

app.get("/_health", (req, res) => {
  return res.json({
    status: "ok",
  });
});

app.use("/webhook/bettermode", bettermodeWebhookRouter);
app.use("/dynamic-block", dynamicBlockRouter);

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error("Uncaught error:", err.message);
  return handleResponse(req, res, {
    success: false,
    error: "Internal server error",
  });
});

app.listen(NODE_APP_PORT, () =>
  logger.info(`Server running on port ${NODE_APP_PORT}`),
);
