import { Badge, Member, Post } from "@tribeplatform/gql-client/types";
import { ConditionOperatorEnum } from "@/enums/condition/operator.enum";
import { ConditionObjectEnum } from "@/enums/condition/object.enum";
import { ConditionTimeWindowEnum } from "@/enums/condition/time-window.enum";
import { PostKeysEnum } from "@/enums/post/post.enum";

// App Config Type
export interface AppConfig {
    [badgeId: BadgeId]: BadgeConfig;
}

// This is what is stored in the bettermode app network settings
export interface AppNetworkSettings {
    config?: AppConfig;
}


// Badge Config Types
export type BadgeConditionId = string;
export interface BadgeCondition {
    if: {
        object: ConditionObjectEnum;
        operator: ConditionOperatorEnum;
        value: number;
    };
    in: {
        window: ConditionTimeWindowEnum;
        operator: ConditionOperatorEnum;
        value: number;
    };
}
export interface BadgeConfig {
    badgeId: string;
    active: boolean;
    conditions: Record<BadgeConditionId, BadgeCondition>;
}

// Post Types
export type PostDetails = Pick<Post, PostKeysEnum>;
export type PostId = Post['id'];
export interface Posts extends Map<PostId, PostDetails>{}

// Badge Types
export type BadgeId = Badge['id'];
export interface AvailableBadges {
    [badgeId: BadgeId]: Badge
}

// Member Types
export type MemberId = Member['id'];
export interface Bucket {
    [conditionId: BadgeConditionId]: number;
}
export interface Buckets {
    [badgeId: BadgeId]: Bucket;
}
export interface MemberDetails {
    id: MemberId;
    buckets: Buckets;
    badges: BadgeId[];
}
export interface Members {
    [memberId: MemberId]: MemberDetails;
}


// Properties that we want to keep in local state
export interface AppState {
    config: AppConfig;
    posts: Posts;
    availableBadges: AvailableBadges;
    members: Members;
    suspendedMembers: MemberId[];
    selectedBadge: BadgeId | null;
}