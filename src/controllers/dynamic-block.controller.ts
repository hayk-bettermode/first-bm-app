import { Logger } from "@tribeplatform/node-logger";
import {
  DynamicBlockRequest,
  DynamicBlockResponse,
  SlateBlock,
  SlateBlockPartial,
} from "../types";
import { BettermodeClient } from "../clients";
import { InteractionService } from "../services";
import { ErrorHandler } from "../utils";
import { InteractionCallbackIdEnum, InteractionTypeEnum } from "../enums";
import { convertXmlToSlateJson } from "@/slates/scripts/convertXmlToSlateJson";
import { AppStateService } from "../services/app-state.service";
import fs from "fs";
import { BADGE_CONDITION_LIMITS } from "@/constants/condition.constants";

export class DynamicBlockController {
  static instance: DynamicBlockController;
  private logger: Logger;
  private appStateService: AppStateService;

  constructor() {
    this.logger = new Logger({
      applicationName: process.env.LOGGING_APP_KEY!,
      context: "DynamicBlockController",
    });
    this.appStateService = AppStateService.getInstance();
    ErrorHandler.initialize("DynamicBlockController");
  }

  async getAppSettingsDynamicBlock(
    body: DynamicBlockRequest,
  ): Promise<DynamicBlockResponse> {
    const { interactionId, appId, callbackId } = body.data;
    const networkId = body.networkId;

    if (!networkId) {
      throw new Error("Missing networkId in request");
    }

    if (callbackId) {
      // Delegate to InteractionService for callback handling
      return InteractionService.getInstance().getSettingsInteractionResponse(
        body,
      );
    }

    try {
      const badges = this.appStateService.getAvailableBadges(networkId);
      const selectedBadgeId = this.appStateService.getSelectedBadge(networkId);
      const selectedBadgeConfig = selectedBadgeId
        ? this.appStateService.getBadgeConfig(networkId, selectedBadgeId)
        : null;

      this.logger.info("Selected badge details", {
        badegId: selectedBadgeId,
        badgeConfig:selectedBadgeConfig
      });

      const condition = selectedBadgeConfig?.conditions?.[`condition-${selectedBadgeId}`];
      const ifValue = condition?.if?.value;
      const inValue = condition?.in?.value;

      // const slate = require("../slates/app-settings.json");
      const slate = convertXmlToSlateJson(
        fs.readFileSync("src/slates/app-settings.xml", "utf-8"),
        {
          selectBadgeCallbackId: InteractionCallbackIdEnum.SELECT_BADGE,
          saveBadgeConfigCallbackId: InteractionCallbackIdEnum.SAVE_BADGE_CONFIG,
          postDaysWindowLimit: BADGE_CONDITION_LIMITS.POST_DAYS_WINDOW_LIMIT,
          badges: Object.values(badges),
          selectedBadge: selectedBadgeId ? badges[selectedBadgeId] : null,
          ifValue: typeof ifValue === 'undefined' ? "" : ifValue,
          inValue: typeof inValue === 'undefined' ? "" : inValue,
        }
      );

      return {
        status: "SUCCEEDED",
        type: "INTERACTION",
        data: {
          appId,
          interactionId,
          interactions: [
            {
              id: interactionId,
              type: "SHOW",
              props: {},
              slate
            },
          ],
        },
      };
    } catch (error: any) {
      this.logger.error("Error in dynamic block", {
        error: error.message,
        networkId,
      });
      throw error;
    }
  }

  static getInstance() {
    if (!DynamicBlockController.instance) {
      DynamicBlockController.instance = new DynamicBlockController();
    }
    return DynamicBlockController.instance;
  }
}
