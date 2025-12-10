import { Logger } from "@tribeplatform/node-logger";
import { AppConfig, AppState, AvailableBadges, Posts, PostDetails, MemberId, Members, MemberDetails, BadgeConditionId, BadgeId, PostId, BadgeConfig } from "@/types/app";
import { Badge, BadgeType } from "@tribeplatform/gql-client/types";
import { set as _set } from "lodash";
import { ConditionOperatorEnum } from "@/enums/condition/operator.enum";
import { ConditionObjectEnum } from "@/enums/condition/object.enum";
import { ConditionTimeWindowEnum } from "@/enums/condition/time-window.enum";
import { BADGE_CONDITION_LIMITS } from "@/constants/condition.constants";

export class AppStateService {
  static instance: AppStateService;
  private logger: Logger;
  private appStates: Map<string, AppState> = new Map();

  constructor() {
    this.logger = new Logger({
      applicationName: process.env.LOGGING_APP_KEY!,
      context: "AppStateService",
    });
  }

  // App state
  getAppState(networkId: string): AppState {
    if (this.appStates.has(networkId)) {
      return this.appStates.get(networkId)!;
    }

    const appState: AppState = {
      config: {},
      availableBadges: {},
      posts: new Map(),
      members: {},
      suspendedMembers: [],
      selectedBadge: null,
    };
    this.appStates.set(networkId, appState);
    return appState;
  }
  deleteAppState(networkId: string) {
    if (!this.appStates.has(networkId)) {
      return;
    }
    this.appStates.delete(networkId);
  }

  // Badge configs
  getAppConfig(networkId: string): AppConfig {
    return this.getAppState(networkId).config;
  }
  setAppConfig(networkId: string, config: AppConfig) {
    this.getAppState(networkId).config = config;
  }
  setBadgeConfig(networkId: string, config: BadgeConfig) {
    this.getAppConfig(networkId)[config.badgeId] = config;
  }
  getBadgeConfig(networkId: string, badgeId: BadgeId): BadgeConfig | undefined {
    return this.getAppConfig(networkId)?.[badgeId];
  }
  setBadgeConfigActive(networkId: string, badgeId: BadgeId, active: boolean) {
    const appState = this.getAppState(networkId);
    appState.config[badgeId].active = active;
  }
  deleteBadgeConfig(networkId: string, badgeId: BadgeId) {
    const appState = this.getAppState(networkId);
    if (!appState.config[badgeId]) {
      return;
    }
    delete appState.config[badgeId];
  }

  // Available badges
  getAvailableBadges(networkId: string): AvailableBadges {
    return this.getAppState(networkId).availableBadges;
  }
  setAvailableBadges(networkId: string, badges: Badge[]) {
    const appState = this.getAppState(networkId);
    appState.availableBadges = Object.fromEntries(badges.map(badge => [badge.id, badge]));
  }
  getAvailableBadge(networkId: string, badgeId: string): Badge | undefined {
    return this.getAvailableBadges(networkId)?.[badgeId];
  }
  setAvailableBadge(networkId: string, badge: Badge) {
    const appState = this.getAppState(networkId);
    appState.availableBadges[badge.id] = badge;
  }
  deleteAvailableBadge(networkId: string, badgeId: string) {
    const appState = this.getAppState(networkId);
    delete appState.availableBadges[badgeId];
  }

  // Posts
  getPosts(networkId: string): Posts {
    return this.getAppState(networkId).posts;
  }
  getPost(networkId: string, postId: PostId): PostDetails | undefined {
    return this.getPosts(networkId).get(postId);
  }
  setPost(networkId: string, post: PostDetails) {
    const appState = this.getAppState(networkId);
    appState.posts.set(post.id, post);
  }
  deletePost(networkId: string, postId: PostId) {
    const appState = this.getAppState(networkId);
    if (!appState.posts.has(postId)) {
      return;
    }
    appState.posts.delete(postId);
  }

  // Members
  getMembers(networkId: string): Members {
    return this.getAppState(networkId).members;
  }
  getMember(networkId: string, memberId: MemberId): MemberDetails | undefined {
    return this.getMembers(networkId)?.[memberId];
  }
  addMember(networkId: string, memberId: MemberId) {
    const appState = this.getAppState(networkId);
    if (appState.members[memberId]) {
      return;
    }
    appState.members[memberId] = {
      id: memberId,
      buckets: {},
      badges: []
    };
  }

  // Member buckets
  setMemberBucketValue(networkId: string, memberId: MemberId, badgeId: BadgeId, conditionId: BadgeConditionId, value: number) {
    const appState = this.getAppState(networkId);
    if (!appState.members[memberId]) {
      this.addMember(networkId, memberId);
    }
    _set(appState.members[memberId].buckets, [badgeId, conditionId], value);
  }
  getMemberBucketValue(networkId: string, memberId: MemberId, badgeId: BadgeId, conditionId: BadgeConditionId): number | undefined {
    return this.getAppState(networkId).members?.[memberId]?.buckets?.[badgeId]?.[conditionId];
  }

  // Member badges
  getMemberBadges(networkId: string, memberId: MemberId): BadgeId[] {
    return this.getAppState(networkId).members?.[memberId]?.badges ?? [];
  }
  addMemberBadge(networkId: string, memberId: MemberId, badgeId: BadgeId) {
    const appState = this.getAppState(networkId);
    if (!appState.members[memberId]) {
      this.addMember(networkId, memberId);
    }
    if (appState.members[memberId].badges.includes(badgeId)) {
      return;
    }
    appState.members[memberId].badges.push(badgeId);
  }
  removeMemberBadge(networkId: string, memberId: MemberId, badgeId: BadgeId) {
    const appState = this.getAppState(networkId);
    if (!appState.members[memberId]) {
      return;
    }
    if (!appState.members[memberId].badges.includes(badgeId)) {
      return;
    }
    appState.members[memberId].badges = appState.members[memberId].badges.filter(id => id !== badgeId);
  }

  // Member status lists
  isMemberSuspended(networkId: string, memberId: MemberId): boolean {
    return this.getAppState(networkId).suspendedMembers.includes(memberId);
  }
  addSuspendedMember(networkId: string, memberId: MemberId) {
    const appState = this.getAppState(networkId);
    if (appState.suspendedMembers.includes(memberId)) {
      return;
    }
    appState.suspendedMembers.push(memberId);
  }
  removeSuspendedMember(networkId: string, memberId: MemberId) {
    const appState = this.getAppState(networkId);
    if (!appState.suspendedMembers.includes(memberId)) {
      return;
    }
    appState.suspendedMembers = appState.suspendedMembers.filter(id => id !== memberId);
  }

  // Selected badge
  getSelectedBadge(networkId: string): BadgeId | null {
    return this.getAppState(networkId).selectedBadge;
  }
  setSelectedBadge(networkId: string, badgeId: BadgeId) {
    const appState = this.getAppState(networkId);
    appState.selectedBadge = badgeId;
  }

  static getInstance() {
    if (!AppStateService.instance) {
        AppStateService.instance = new AppStateService();
    }
    return AppStateService.instance;
  }
}