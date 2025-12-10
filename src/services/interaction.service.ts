import { Logger } from "@tribeplatform/node-logger";
import {
  DynamicBlockRequest,
  DynamicBlockResponse,
} from "../types";
import { ErrorHandler } from "../utils";
import { InteractionCallbackIdEnum, InteractionTypeEnum } from "../enums";
import { AppStateService } from "./app-state.service";
import { ConditionObjectEnum } from "@/enums/condition/object.enum";
import { ConditionOperatorEnum } from "@/enums/condition/operator.enum";
import { ConditionTimeWindowEnum } from "@/enums/condition/time-window.enum";
import { BadgeOrchestrationService } from "./badge-orchestration.service";

export class InteractionService {
  static instance: InteractionService;
  private logger: Logger;
  private appStateService: AppStateService;
  private badgeOrchestrationService: BadgeOrchestrationService;

  constructor() {
    this.logger = new Logger({
      applicationName: process.env.LOGGING_APP_KEY!,
      context: "InteractionService",
    });
    this.appStateService = AppStateService.getInstance();
    this.badgeOrchestrationService = BadgeOrchestrationService.getInstance();
    ErrorHandler.initialize("InteractionService");
  }

  async getSettingsInteractionResponse(
    body: DynamicBlockRequest,
  ): Promise<DynamicBlockResponse> {
    const { interactionId, appId, callbackId } = body.data;
    const { networkId } = body;

    if (!networkId) {
      return this.createErrorResponse(
        appId || "",
        interactionId || "",
        "Missing networkId in request",
      );
    }

    if (callbackId && callbackId.startsWith(InteractionCallbackIdEnum.SELECT_BADGE)) {
      return this.handleSelectBadge(body);
    } else if (callbackId === InteractionCallbackIdEnum.SAVE_BADGE_CONFIG) {
      return this.handleSaveBadgeConfig(body);
    } else {
      return {
        type: "INTERACTION",
        status: "FAILED",
        data: {
          appId: appId || "",
          interactionId: interactionId || "",
          interactions: [],
        },
      };
    }
  }

  private async handleSelectBadge(
    body: DynamicBlockRequest,
  ): Promise<DynamicBlockResponse> {
    const { interactionId, appId, callbackId } = body.data;
    const { networkId } = body;

    const badgeId = callbackId!.replace(InteractionCallbackIdEnum.SELECT_BADGE + "_", "");

    this.appStateService.setSelectedBadge(networkId, badgeId);

    return {
      type: "INTERACTION",
      status: "SUCCEEDED",
      data: {
        appId: appId || "",
        interactionId: interactionId || "",
        interactions: [
          {
            id: interactionId || "",
            type: InteractionTypeEnum.RELOAD,
            props: {
              dynamicBlockKeys: [interactionId || ""],
            },
          },
        ],
      },
    };
  }

  private async handleSaveBadgeConfig(
    body: DynamicBlockRequest,
  ): Promise<DynamicBlockResponse> {
    const { interactionId, appId, inputs } = body.data;
    const { networkId } = body;

    if (!inputs) {
      return this.createErrorResponse(
        appId || "",
        interactionId || "",
        "Missing form data",
      );
    }

    try {
      const badgeId = inputs['badge-id'];
      const badgeName = inputs['badge-name'];
      const ifObject = ConditionObjectEnum.NUMBER_OF_POSTS;
      const ifOperator = ConditionOperatorEnum.GREATER_THAN_OR_EQUALS;
      const ifValue = Number(inputs['if-value']);
      const inWindow = ConditionTimeWindowEnum.LAST_N_DAYS;
      const inOperator = ConditionOperatorEnum.EQUALS;
      const inValue = Number(inputs['in-value']);

      if (!badgeId || !badgeName || !Number.isInteger(ifValue) || !Number.isInteger(inValue) || isNaN(ifValue) || isNaN(inValue)) {
        return this.createErrorResponse(
          appId || "",
          interactionId || "",
          "Invalid form data",
        );
      }

      // Save Badge Config
      this.badgeOrchestrationService.handleBadgeConfigSaved(networkId, {
        badgeId,
        active: true,
        conditions: {
          [`condition-${badgeId}`]: {
            if: {
              object: ifObject,
              operator: ifOperator,
              value: ifValue
            },
            in: {
              window: inWindow,
              operator: inOperator,
              value: inValue
            }
          }
        },
      });

      return {
        type: "INTERACTION",
        status: "SUCCEEDED",
        data: {
          appId: appId || "",
          interactionId: interactionId || "",
          interactions: [
            {
              id: `${interactionId}-toast`,
              type: InteractionTypeEnum.OPEN_TOAST,
              props: {
                status: "success",
                title: "Badge Configuration Saved",
                description: `Successfully saved badge configuration for "${badgeName}"`
              },
            },
            {
              id: interactionId || "",
              type: InteractionTypeEnum.RELOAD,
              props: {
                dynamicBlockKeys: [interactionId || ""],
              },
            },
          ],
        },
      };
    } catch (error: unknown) {
      this.logger.error(
        "Failed to save badge configuration",
        (error as Error)?.message || error,
      );

      return this.createErrorResponse(
        appId || "",
        interactionId || "",
        "Failed to save badge configuration",
      );
    }
  }

  private createErrorResponse(
    appId: string,
    interactionId: string,
    message: string,
  ): DynamicBlockResponse {
    return {
      type: "INTERACTION",
      status: "SUCCEEDED",
      data: {
        appId,
        interactionId,
        interactions: [
          {
            id: `${interactionId}-error-toast`,
            type: InteractionTypeEnum.OPEN_TOAST,
            props: {
              title: "Error",
              description: message,
              status: "error",
            },
          },
        ],
      },
    };
  }

  static getInstance() {
    if (!InteractionService.instance) {
      InteractionService.instance = new InteractionService();
    }
    return InteractionService.instance;
  }
}
