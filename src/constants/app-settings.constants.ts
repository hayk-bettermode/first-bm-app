import { ConditionObjectEnum } from "@/enums/condition/object.enum";
import { ConditionOperatorEnum } from "@/enums/condition/operator.enum";
import { ConditionTimeWindowEnum } from "@/enums/condition/time-window.enum";
import { AppNetworkSettings } from "@/types/app";

export const INITIAL_APP_NETWORK_SETTINGS: AppNetworkSettings = {
    config: {}
} as const;
