import { NextFunction, Request, Response } from "express";
import { Logger } from "@tribeplatform/node-logger";
import { ErrorHandler, verifySignature } from "../utils";
import { BadgeOrchestrationService } from "@/services/badge-orchestration.service";
import { Badge } from "@tribeplatform/gql-client/types";
import { PostDetails } from "@/types/app";
import { PostKeysEnum } from "@/enums/post/post.enum";
import { pick as _pick } from "lodash";

export class BettermodeWebhookController {
  static instance: BettermodeWebhookController;
  private logger: Logger;
  private badgeOrchestrationService: BadgeOrchestrationService;

  constructor() {
    this.logger = new Logger({
      applicationName: process.env.LOGGING_APP_KEY!,
      context: "BettermodeWebhookController",
    });
    this.badgeOrchestrationService = BadgeOrchestrationService.getInstance();
    ErrorHandler.initialize("BettermodeWebhookController");
  }

  webhookSignatureMiddleware(
    req: Request & { rawBody?: Buffer },
    res: Response,
    next: NextFunction,
  ): void {
    const signature = req.headers["x-bettermode-signature"] as string;
    const timestamp = req.headers["x-bettermode-request-timestamp"] as string;

    if (!signature || !timestamp) {
      const error = ErrorHandler.createAuthenticationError("Missing headers");
      res.status(403).json(error);
      return;
    }

    const secret = process.env.SIGNING_SECRET!;
    const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body));

    try {
      const isValid = verifySignature(rawBody.toString(), signature, secret);

      if (!isValid) {
        const error =
          ErrorHandler.createAuthenticationError("Invalid signature");
        res.status(403).json(error);
        return;
      }

      next();
    } catch (error) {
      const errorResponse =
        ErrorHandler.createAuthenticationError("Invalid timestamp");
      res.status(403).json(errorResponse);
      return;
    }
  }

  async getWebhookResponse(body: any): Promise<any> {
    this.logger.info("📥 Webhook received", {
      type: body.type,
      networkId: body.networkId,
      timestamp: new Date().toISOString(),
    });

    switch (body.type) {
      case "TEST":
        this.logger.info("🧪 Test webhook received", {
          challenge: body.data.challenge,
        });

        // TODO: Cleanup
        this.handleAppInstalled(body);

        return {
          type: body.type,
          status: "SUCCEEDED",
          data: {
            challenge: body.data.challenge,
          },
        };
      case "UPDATE_SETTINGS":
        return this.updateSettings(body);
      case "GET_SETTINGS":
        return this.getSettings(body);
      case "INTERACTION":
        this.logger.info("🔄 Interaction webhook received");
        // TODO: Handle interactions
        return {
          type: "INTERACTION",
          status: "SUCCEEDED",
          data: {},
        };
      case "SUBSCRIPTION":
        switch (body.data?.name) {
          // App lifecycle related webhooks
          case "app_installation.created":
            return this.handleAppInstalled(body);
          
            // Badge related webhooks
          case "badge.created":
            return this.handleBadgeCreated(body);
          case "badge.updated":
            return this.handleBadgeUpdated(body);
          case "badge.deleted":
            return this.handleBadgeDeleted(body);

          // Member related webhooks
          case "member.deleted":
          case "sso_membership.deleted":
          case "member.suspended":
            return this.handleMemberSuspended(body);
          case "member.unsuspended":
            return this.handleMemberUnsuspended(body);

          // Post related webhooks
          case "post.published":
          case "post.unhidden":
          case "post.hidden":
          case "post.unpublished":
          case "post.deleted":
            return this.handlePostChangesReceived(body);

          default:
            return {
              type: "SUBSCRIPTION",
              status: "SUCCEEDED",
              data: {},
            };
        }
      case "APP_UNINSTALLED":
        this.logger.info("🗑️ APP_UNINSTALLED webhook received", {
          networkId: body.networkId,
        });
        return this.handleAppUninstalled(body);
      default:
        this.logger.warn("❓ Unknown webhook type", { type: body.type });
        return {
          type: "UNKNOWN",
          status: "FAILED",
          errorCode: "UNKNOWN_TYPE",
          errorMessage: "Unknown webhook type",
        };
    }
  }

  private async updateSettings(input: any): Promise<any> {
    this.logger.info("Received UPDATE_SETTINGS webhook", { input });
    return {
      type: "UPDATE_SETTINGS",
      status: "SUCCEEDED",
      data: {},
    };
  }
  private async getSettings(input: any): Promise<any> {
    this.logger.info("Received GET_SETTINGS webhook", { input });
    return {
      type: "GET_SETTINGS",
      status: "SUCCEEDED",
      data: {},
    };
  }

  // App lifecycle related webhook handlers
  private async handleAppInstalled(body: any): Promise<any> {
    try {
      const networkId = body.networkId;

      if (!networkId) {
        this.logger.warn("app_installation.created webhook missing networkId");
        return { type: "SUBSCRIPTION", status: "SUCCEEDED", data: {} };
      }

      await this.badgeOrchestrationService.handleAppInstalled(networkId);
    } catch (error) {
      this.logger.error(`Failed to handle ${body.data.name}`, {
        error: error instanceof Error ? error.message : String(error),
        networkId: body.networkId,
      });
    }

    return { type: "SUBSCRIPTION", status: "SUCCEEDED", data: {} };
  }
  private async handleAppUninstalled(body: any): Promise<any> {
    try {
      const networkId = body.networkId;

      if (!networkId) {
        this.logger.warn("APP_UNINSTALLED webhook missing networkId");
        return {
          type: "APP_UNINSTALLED",
          status: "FAILED",
          errorCode: "MISSING_NETWORK_ID",
          errorMessage: "Missing networkId in webhook body",
        };
      }

      this.badgeOrchestrationService.handleAppUninstalled(networkId);

      return {
        type: "APP_UNINSTALLED",
        status: "SUCCEEDED",
        data: {},
      };
    } catch (error) {
      this.logger.error(`Failed to handle ${body.data.name}`, {
        error: error instanceof Error ? error.message : String(error),
        networkId: body.networkId,
      });
      return {
        type: "APP_UNINSTALLED",
        status: "FAILED",
        errorCode: "CLEANUP_ERROR",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // Badge related webhook handlers
  private async handleBadgeCreated(body: any): Promise<any> {
    try {
      const networkId = body.networkId;
      const badge: Badge = body.data.object;
      this.badgeOrchestrationService.handleBadgeCreated(networkId, badge);
    } catch (error) {
      this.logger.error(`Failed to handle ${body.data.name}`, {
        error: error instanceof Error ? error.message : String(error),
        networkId: body.networkId,
        badgeId: body.data.object.id,
        badgeName: body.data.object.name,
      });
    }
    
    return { type: "SUBSCRIPTION", status: "SUCCEEDED", data: {} };
  }
  private async handleBadgeUpdated(body: any): Promise<any> {
    try {
      const networkId = body.networkId;
      const badge: Badge = body.data.object;
      this.badgeOrchestrationService.handleBadgeUpdated(networkId, badge);
    } catch (error) {
      this.logger.error(`Failed to handle ${body.data.name}`, {
        error: error instanceof Error ? error.message : String(error),
        networkId: body.networkId,
        badgeId: body.data.object.id,
        badgeName: body.data.object.name,
      });
    }
    
    return { type: "SUBSCRIPTION", status: "SUCCEEDED", data: {} };
  }
  private async handleBadgeDeleted(body: any): Promise<any> {
    try {
      const networkId = body.networkId;
      const badge: Badge = body.data.object;
      this.badgeOrchestrationService.handleBadgeDeleted(networkId, badge);
    } catch (error) {
      this.logger.error(`Failed to handle ${body.data.name}`, {
        error: error instanceof Error ? error.message : String(error),
        networkId: body.networkId,
        badgeId: body.data.object.id,
        badgeName: body.data.object.name,
      });
    }
    
    return { type: "SUBSCRIPTION", status: "SUCCEEDED", data: {} };
  }

  // Member related webhook handlers
  private async handleMemberSuspended(body: any): Promise<any> {
    try {
      const networkId = body.networkId;
      const memberId: string = body.data.object.id;
      this.badgeOrchestrationService.handleMemberSuspended(networkId, memberId);
    } catch (error) {
      this.logger.error(`Failed to handle ${body.data.name}`, {
        error: error instanceof Error ? error.message : String(error),
        networkId: body.networkId,
        memberId: body.data.object.id,
        memberName: body.data.object.name,
      });
    }
    
    return { type: "SUBSCRIPTION", status: "SUCCEEDED", data: {} };
  }
  private async handleMemberUnsuspended(body: any): Promise<any> {
    try {
      const networkId = body.networkId;
      const memberId: string = body.data.object.id;
      this.badgeOrchestrationService.handleMemberUnsuspended(networkId, memberId);
    } catch (error) {
      this.logger.error(`Failed to handle ${body.data.name}`, {
        error: error instanceof Error ? error.message : String(error),
        networkId: body.networkId,
        memberId: body.data.object.id,
        memberName: body.data.object.name,
      });
    }
    
    return { type: "SUBSCRIPTION", status: "SUCCEEDED", data: {} };
  }

  // Post related webhook handlers
  private async handlePostChangesReceived(body: any): Promise<any> {
    try {
      const networkId = body.networkId;
      this.logger.error(`Received ${body.data.name}`, {
        post: body.data.object
      });
      const post: PostDetails = _pick(body.data.object, Object.values(PostKeysEnum));
      this.badgeOrchestrationService.handlePostChangesReceived(networkId, post);
    } catch (error) {
      this.logger.error(`Failed to handle ${body.data.name}`, {
        error: error instanceof Error ? error.message : String(error),
        networkId: body.networkId,    
        postId: body.data.object.id,
        postTitle: body.data.object.title,
      });
    }
    
    return { type: "SUBSCRIPTION", status: "SUCCEEDED", data: {} };
  }

  static getInstance() {
    if (!BettermodeWebhookController.instance) {
      BettermodeWebhookController.instance = new BettermodeWebhookController();
    }
    return BettermodeWebhookController.instance;
  }
}
