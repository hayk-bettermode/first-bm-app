import express, { Request, Response } from "express";
import bodyParser from "body-parser";
import { BettermodeWebhookController } from "../controllers";
import { BodyParserRequest } from "../types";
import { Logger } from "@tribeplatform/node-logger";
import { ErrorHandler } from "../utils";

const bettermodeWebhookRouter = express.Router();
const logger = new Logger({
  applicationName: process.env.LOGGING_APP_KEY!,
  context: "bettermode-webhook-router",
});

bettermodeWebhookRouter.use(
  bodyParser.json({
    verify: (req: Request & BodyParserRequest, res: Response, buf: Buffer) => {
      req.rawBody = buf;
    },
  }),
);

bettermodeWebhookRouter.post(
  "/",
  async (req: Request & BodyParserRequest, res: Response) => {
    try {
      logger.info("🚀 Webhook endpoint hit", {
        method: req.method,
        url: req.url,
        bodyType: req.body?.type,
        networkId: req.body?.networkId,
        timestamp: new Date().toISOString(),
      });

      const response =
        await BettermodeWebhookController.getInstance().getWebhookResponse(
          req.body,
        );

      logger.info("✅ Webhook processed successfully", {
        responseType: response.type,
        status: response.status,
        timestamp: new Date().toISOString(),
      });

      return res.json(response);
    } catch (error) {
      logger.error("❌ Webhook processing failed", {
        error: (error as Error).message,
        stack: (error as Error).stack,
        timestamp: new Date().toISOString(),
      });

      const errorResponse = ErrorHandler.handleUnexpectedError(
        error,
        "bettermode-webhook-router",
      );
      res.status(500).json(errorResponse);
    }
  },
);

export { bettermodeWebhookRouter };
