import { Badge, PostStatus } from "@tribeplatform/gql-client/types";
import { Logger } from "@tribeplatform/node-logger";
import { AppStateService } from "./app-state.service";
import { BettermodeClient } from "@/clients/bettermode.client";
import { TimeWindowJobService } from "@/services/time-window-job.service";
import { AppNetworkSettings, BadgeCalculationFilters, BadgeCondition, BadgeConditionId, BadgeConfig, BadgeId, MemberId, Members, PostDetails, PostId } from "@/types/app";
import { INITIAL_APP_NETWORK_SETTINGS } from "@/constants/app-settings.constants";
import { BADGE_CONDITION_LIMITS } from "@/constants/condition.constants";
import { difference as _difference, has as _has, omit as _omit, set as _set, without as _without } from "lodash";
import { ConditionObjectEnum } from "@/enums/condition/object.enum";
import { ConditionOperatorEnum } from "@/enums/condition/operator.enum";

export class BadgeOrchestrationService {
  static instance: BadgeOrchestrationService;
  private logger: Logger;
  private appStateService: AppStateService;
  private timeWindowJobService: TimeWindowJobService;

  // Keeping track of networks app is installed in to make sure we are executing APP_INSTALLED webhook handler once
  private networksInstalledIn: Set<string> = new Set();

  constructor() {
    this.logger = new Logger({
      applicationName: process.env.LOGGING_APP_KEY!,
      context: "BadgeOrchestrationService",
    });
    this.appStateService = AppStateService.getInstance();
    this.timeWindowJobService = TimeWindowJobService.getInstance();
  }

  // Webhook handlers

  async handleTestReceived(networkId: string): Promise<void> {
    this.logger.info("handleTestReceived", { networkId });
    // await this.handlePostChangesReceived("123", {
    //   id: "123" as PostId,
    //   title: "Test Post",
    //   status: PostStatus.PUBLISHED,
    //   isHidden: false,
    //   createdById: "MMU943qnxO" as MemberId,
    //   publishedAt: new Date().toISOString(),
    // } as PostDetails);
    try {
      // const bettermodeClient = new BettermodeClient(networkId);
      // await bettermodeClient.updateAppNetworkSettings({});
      // await new Promise((resolve) => setTimeout(resolve, 1000));

      await this.handleAppInstalled(networkId);
    } catch (error: any) {
      this.logger.error("Error in handleTestReceived", {
        error: error.message,
        networkId,
      });
    }
  }

  // ✅ DONE
  async handleAppInstalled(networkId: string) {
    if (this.networksInstalledIn.has(networkId)) {
      this.logger.info("App already installed in network", { networkId });
      return;
    }
    this.networksInstalledIn.add(networkId);

    const bettermodeClient = new BettermodeClient(networkId);

    // Get app network settings from Bettermode
    const settings = await bettermodeClient.getAppNetworkSettings();
    this.appStateService.setAppConfig(networkId, settings?.config || {});

    // Get all manual badges from Bettermode
    const badges = await bettermodeClient.getAllManualBadges();
    this.appStateService.setAvailableBadges(networkId, badges);
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Fetch posts metadata
    const posts = await bettermodeClient.getAllPostsMatadata(100, 2000, 100);
    this.appStateService.setPosts(networkId, posts);

    // Create time window shifting job
    this.timeWindowJobService.start(networkId, () => this.shiftTimeWindow(networkId));

    // Calculate and apply badges for all members
    await this.calculateAndApplyBadges(networkId);

    this.logger.info("✅ Successfully initialized the app", {
      networkId,
      loaded: {
        badges: badges.length,
        posts: posts.length,
        configs: Object.keys(settings?.config ?? {}).length
      }
    });
  }
  // ✅ DONE
  handleAppUninstalled(networkId: string) {
    if (!this.networksInstalledIn.has(networkId)) {
      this.logger.info("App not installed in network", { networkId });
      return;
    }
    this.networksInstalledIn.delete(networkId);

    // 1. Delete time window shifting job
    this.timeWindowJobService.stop(networkId);
    
    // 2. Delete app state
    this.appStateService.deleteAppState(networkId);

    this.logger.info("✅ Successfully cleaned up installation data", { networkId });
  }

  // ✅ DONE
  handleUpdateSettings(networkId: string, settings: AppNetworkSettings) {
    // We want to keep ALL of the settings persisted
    // in bettermode's app network settings storage, hence utilizing the "toStore" key.
    return {
      toStore: {
        ...settings
      }
    };
  }
  // ✅ DONE
  handleGetSettings(networkId: string, appId: string, currentSettings: Record<string, any>) {   
    const { settings }: { settings: AppNetworkSettings } = currentSettings.find((setting: any) => {
      return setting.networkId === networkId
        && setting.appId === appId;
    });

    return settings;
  }
 
  // ✅ DONE
  handleBadgeCreated(networkId: string, badge: Badge) {
    // Adding to available badges state.
    // It will now be available in Settings page to configure rules for.
    this.appStateService.setAvailableBadge(networkId, badge);
    this.logger.info("✅ Successfully added a newly created badge to app state", { networkId, badgeId: badge.id, badgeName: badge.name });
  }
  // ✅ DONE
  handleBadgeUpdated(networkId: string, badge: Badge) {
    const initialBadge = this.appStateService.getAvailableBadge(networkId, badge.id);

    // Checking if there was a change in active state
    if (initialBadge?.active !== badge.active) {
      this.logger.info("🔄 Badge active state changed", { networkId, badgeId: badge.id, badgeName: badge.name, initialActive: initialBadge?.active, newActive: badge.active });

      if (badge.active) {
        this.handleBadgeReactivated(networkId, badge);
      } else {
        this.handleBadgeDeactivated(networkId, badge);
      }
      return;
    }

    // Updating the badge in the app state
    // It will now be available in Settings page in its updated form
    this.appStateService.setAvailableBadge(networkId, badge);

    this.logger.info("✅ Successfully updated badge", { networkId, badgeId: badge.id, badgeName: badge.name });
  }
  // ✅ DONE
  async handleBadgeReactivated(networkId: string, badge: Badge) {
    this.appStateService.setAvailableBadge(networkId, badge);
    this.appStateService.setBadgeConfigStatus(networkId, badge.id, true);
    await this.calculateAndApplyBadges(networkId, { badgeIds: [badge.id] });
    this.logger.info("🔄 Reactivated badge", { networkId, badgeId: badge.id, badgeName: badge.name });
  }
  // ✅ DONE
  async handleBadgeDeactivated(networkId: string, badge: Badge) {
    this.appStateService.setAvailableBadge(networkId, badge);
    this.appStateService.setBadgeConfigStatus(networkId, badge.id, false);
    await this.calculateAndApplyBadges(networkId, { badgeIds: [badge.id] });
    this.logger.info("🔄 Deactivated badge", { networkId, badgeId: badge.id, badgeName: badge.name });
  }
  // ✅ DONE
  handleBadgeDeleted(networkId: string, badge: Badge) {
    this.appStateService.addRemovedBadge(networkId, badge.id);
    this.appStateService.deleteAvailableBadge(networkId, badge.id);
    this.logger.info("✅ Successfully deleted badge", { networkId, badgeId: badge.id, badgeName: badge.name });
  }

  // ✅ DONE
  handleMemberSuspended(networkId: string, memberId: string) {
    this.logger.info("Member suspended", { networkId, memberId });

    // Add the memberId to the SUSPENDED_MEMBERS list in app state.
    // - We still calculate badges for them,
    // - revoke expired ones,
    // - but do not assign new ones until unsuspended.
    this.appStateService.addSuspendedMember(networkId, memberId);
  }
  // ✅ DONE
  handleMemberUnsuspended(networkId: string, memberId: string) {
    this.logger.info("Member unsuspended", { networkId, memberId });

    // 1. Remove the memberId from the SUSPENDED_MEMBERS list in app state
    this.appStateService.removeSuspendedMember(networkId, memberId);
    
    // 2. Get member's calculated badges
    const badges: BadgeId[] = this.appStateService.getMemberBadges(networkId, memberId);
    
    // 3. Apply the badges to the member in bettermode
    const badgesToAssign: Record<BadgeId, MemberId[]> = {};
    badges.forEach((badgeId) => {
      badgesToAssign[badgeId] = [memberId];
    });
    this.individuallyAssignAndRevokeBadgesForMembersInBettermode(networkId, badgesToAssign, {});
  }
  
  // ✅ DONE
  async handlePostChangesReceived(networkId: string, post: PostDetails) {
    this.logger.info("Post changes received", {
      networkId,
      postId: post.id,
      postTitle: post.title,
      postStatus: post.status,
      postIsHidden: post.isHidden
    });

    // Track affected member
    const memberId: MemberId = post?.createdById;
    if (!memberId || post.isAnonymous) {
      // This is an anonymous post - we can ignore it
      this.logger.info("Ignoring post webhook for anonymous post", { networkId, postId: post.id, postTitle: post.title });
      return;
    }

    // Check if post is new or updated
    // const oldPost = this.appStateService.getPost(networkId, post.id);
    // const isNewPost = typeof oldPost === "undefined";
    // const postWasVisible = oldPost && oldPost.isHidden !== true && oldPost.status === "PUBLISHED";
    // const postIsVisible = post.isHidden !== true && post.status === "PUBLISHED";

    // Check if the change in post visibility requires us to increment or decrement buckets
    // const isIncrementingBuckets: boolean = !postWasVisible && postIsVisible;
    // const isDecrementingBuckets: boolean = postWasVisible && !postIsVisible;

    // Add/Update the post details in the app state
    this.appStateService.setPost(networkId, post);

    // 3. Use the badge configs to INCREMENT/DECREMENT any affected badge buckets
    // 4. Use the affected badge buckets to calculate the final badges
    
    // TODO: This is not performant, but calculating all badges for the DEMO app
    await this.calculateAndApplyBadges(networkId, { memberIds: [memberId] });
  }


  // ✅ DONE: Interaction Handlers
  async handleBadgeSelectedInSettings(networkId: string, badgeId: BadgeId) {
    this.logger.info("Badge selected in settings", { networkId, badgeId });
    this.appStateService.setSelectedBadge(networkId, badgeId);
    this.logger.info("✅ Successfully selected badge in settings", {
      networkId, badgeId,
      selectedBadgeId: this.appStateService.getSelectedBadge(networkId)
    });
  }
  async handleBadgeConfigSaved(networkId: string, badgeConfig: BadgeConfig) {
    this.logger.info("Badge config saved", { networkId, badgeConfig });

    // Update the badge config in the app state
    const ifValue = badgeConfig.conditions[Object.keys(badgeConfig.conditions)[0]].if.value;
    if (ifValue === 0) {
      this.logger.info("Badge config IF value is 0, removing config", { networkId, badgeConfig });
      this.appStateService.deleteBadgeConfig(networkId, badgeConfig.badgeId);
    } else {
      this.appStateService.setBadgeConfig(networkId, badgeConfig);
    }

    // Persist badge config
    const bettermodeClient = new BettermodeClient(networkId);
    await bettermodeClient.updateAppNetworkSettings({
      config: this.appStateService.getAppConfig(networkId)
    });

    // Calculate and apply badges for the network
    await this.calculateAndApplyBadges(networkId, { badgeIds: [badgeConfig.badgeId] });
  }


  // ✅ DONE: Cron Job Handlers
  async shiftTimeWindow(networkId: string) {
    try {
      this.logger.info("Starting nightly time window shifting for network", { networkId });

      const affectedMemberIds: MemberId[] = [];

      const posts = this.appStateService.getPosts(networkId);
      for (const [postId, post] of posts) {
        // "posts" is a Map respecting the order of insertion, i.e. oldest posts are first.
        // ASSUMPTION: when we reach a post that is not expired, then all the rest will not be expired.
        const isPostExpired =
          (new Date().getTime() - new Date(String(post.publishedAt)).getTime())
          >= BADGE_CONDITION_LIMITS.POST_DAYS_WINDOW_LIMIT_MS;
        
          if (!isPostExpired) {
          this.logger.info("We removed all expired posts from the time window");
          break; // Exits the loop
        }

        if (!affectedMemberIds.includes(post.createdById)) {
          affectedMemberIds.push(post.createdById);
        }

        // Remove the post details from app state
        this.appStateService.deletePost(networkId, postId);
      }
      
      // Calculate the final badges for the affected members
      if (affectedMemberIds.length > 0) {
        await this.calculateAndApplyBadges(networkId, { memberIds: affectedMemberIds });
      }

      this.logger.info("🔄 Shifted time window for network", { networkId });
    } catch (error: any) {
      this.logger.error("Error in time window shifting job", {
        error: error.message,
        networkId,
      });
    } finally {
      this.logger.info("Nightly time window shifting completed for network", { networkId });
    }
  }


  // MAIN LOGIC FOR CALCULATING BADGES
  // TODO: This is not performant, rewrite for production
  async calculateAndApplyBadges(networkId: string, filters: BadgeCalculationFilters = {}) {
    this.logger.info("calculateAndApplyBadges", { networkId, filters });
    // SCENARIOS / NEW
    // + 1. Newly installed APP (no configs) -> load posts, do nothing.
    // + 2. Post published -> add to state, ok to recalculate
    // + 3. Badge config added/saved -> update state, ok to recalculate
    // + 4. New badge created -> update state, no need to recalculate
    // x 5. New memeber added -> do nothing

    // SCENARIOS / UPDATE TO STATE
    // + 1. Post hidden -> update state, ok to recalculate
    // + 2. Post unhidden -> update state, ok to recalculate
    // + 3. Badge config updated -> update state, ok to recalculate
    // + 4. Member suspended ->
    //    + add to skip list,
    //    + revoke old badges as usual,
    //    + calculate, but don't assign new badges to them until unsuspended
    // + 5. Member unsuspended -> assign precalculated badges
    // + 6. Badge disabled ->
    //    + mark disabled in app state,
    //    + recalculate
    //    + skip the badge's config from recalculation
    // + 7. Badge enabled ->
    //    + mark enabled in app state,
    //    + recalculate

    // SCENARIOS / CLEANING
    // + 1. Post deleted -> update status in state, ok to recalculate
    // + 2. Badge deleted ->
    //    + add to removed badges state,
    //    + remove config,
    //    + no recalculation needed
    // x 3. Badge config removed - not implemented
    // + 4. App uninstalled ->
    //    + stop cron job,
    //    + delete state,
    //    + leave currently assigned badges as is.
    // + 5. Cron job ->
    //    + remove MAX_WINDOW expired posts
    //    + always recalculate - there may be posts that expire the config window, but not the MAX window


    // ---- IN EVERY CYCLE
    // 1. Calculate the current correct badges for all members
    // 2. Diff the badge lists with what members have currently assigned
    // 3. Revoke stale badges
    // 4. Assign current badges

    // if badge is disabled skip the apropriate config from calcluation
    // if member is suspended calculate badges, revoke as usual, but don't assign new badges to them until unsuspended

    const members: Members = this.calculateMemberBuckets(networkId, filters);
    console.log("members", members);
    this.appStateService.setMembers(networkId, members);

    
    // ASSUMPTION: There will be fewer badges in a community than members.
    // So to optimize for least number of assing/revoke calls,
    // we will make an assign/revoke call per badge, but for multiple members.
    // const { badgesToAssign, badgesToRevoke } = this.calculateBadgesToAssignAndRevoke(networkId, members);
    // await this.massAssignAndRevokeBadgesForMembersInBettermode(networkId, badgesToAssign, badgesToRevoke);

    // ASSUMPTION: There will be handful badges and memebers in a DEMO community.
    // So to avoid long running mass assing/revoke calls,
    // we will make an assign/revoke call per badge / per member.
    // TODO: Optimize for performance by batching the calls.
    const { badgesToAssign, badgesToRevoke } = this.calculateBadgesToAssignAndRevoke(networkId, members);
    await this.individuallyAssignAndRevokeBadgesForMembersInBettermode(networkId, badgesToAssign, badgesToRevoke);
  }
  calculateMemberBuckets(networkId: string, filters: BadgeCalculationFilters = {}) {
    const appConfig = this.appStateService.getAppConfig(networkId);
    const posts = this.appStateService.getPosts(networkId);
    const oldMembers: Members = this.appStateService.getMembers(networkId);
    const currentTimeMs = new Date().getTime();
    const millisecondsPerDay = 86400000;

    /*
    {
      [memberId]: {
        id: memberId,
        "buckets": {
          [badgeId]: {
            "conditions": {
              [conditionId]: 0
            },
            "metConditions": [
              conditionId1,
              conditionId2,
              ...
            ]
          }
        },
        previousBadges: [badgeId1, badgeId2, ...],
        badges: [badgeId]
      }
    }
    */
    let members: Members = {};

    // If there are no posts or app configs, we don't have anything to calculate
    if (posts.size === 0 || Object.keys(appConfig).length === 0) {
      return members;
    }

    // If a memberId filter is provided, then we only want to diff the buckets for that member.
    // Other members did not change, we can reuse their buckets
    if (filters?.memberIds?.length && filters.memberIds.length > 0) {
      members = _omit(oldMembers, filters.memberIds);
    }

    let postIndex = 1;
    posts.forEach((post) => {
      const diff = currentTimeMs - new Date(String(post.publishedAt)).getTime();
      const publishedDaysAgo = diff / millisecondsPerDay;
      const isPostCounted = post.isHidden === false && post.status === "PUBLISHED";
      console.log(`\x1b[34m${postIndex}. POST -> ${post.title}\x1b[0m`, {
        publishedDaysAgo,
        isPostCounted
      });
      postIndex++;

      // Filter by memberId
      // If a memberId filter is provided, the triggering change is only relevant to that member.
      // All other posts are irrelevant to the calculation.
      const memberId: MemberId = post.createdById;
      // if (filters.memberIds && !filters.memberIds.includes(memberId)) {
      //   return;
      // }

      if (!_has(members, memberId)) {
        members[memberId] = {
          id: memberId,
          buckets: {},
          previousBadges: [
            ...this.appStateService.getMemberBadges(networkId, memberId)
          ],
          badges: [],
        };
      }

      // If a post is not visible, it does not count towards any badges
      if (!isPostCounted) {
        return;
      }

      Object.keys(appConfig).forEach((badgeId: BadgeId) => {
        // Filter by badgeId
        // If a badgeId filter is provided, the triggering change is only relevant to that badge/config.
        // All other badges are irrelevant to the calculation.
        // if (filters.badgeIds && !filters.badgeIds.includes(badgeId)) {
        //   return;
        // }

        if (!_has(members[memberId].buckets, badgeId)) {
          members[memberId].buckets[badgeId] = {
            conditions: {},
            metConditions: [],
          };
        }

        const badgeConfig = appConfig[badgeId];
        const conditions = badgeConfig.conditions;

        // If badge is disabled (thus badge config is not active)
        // skip the apropriate config from calcluation
        if (!badgeConfig.active) {
          // Remove the badge from the previous badges list
          // so we don't make a call to revoke it when we calculate the badges to revoke
          members[memberId].previousBadges = _without(members[memberId].previousBadges ?? [], badgeId);
          return;
        }

        const memberBadgeBucket = members[memberId].buckets[badgeId];

        // If the member's config conditions are already met,
        // we can skip the calculation for this config
        const metConditions: BadgeConditionId[] = memberBadgeBucket.metConditions ?? [];

        if (metConditions.length === Object.keys(conditions).length) {
          // All conditions are met, we can skip the calculation for this config
          return;
        }
        
        // Now let's check if the post meets the conditions
        Object.keys(badgeConfig.conditions).forEach((conditionId) => {
          const condition = badgeConfig.conditions[conditionId];
          const isWithinTheTimeWindow = publishedDaysAgo < condition.in.value;

          console.log(">> condition check 1", {
            conditionId,
            badgeName: this.appStateService.getAvailableBadge(networkId, badgeId)?.name,
            isWithinTheTimeWindow
          });

          if (isWithinTheTimeWindow) {
            memberBadgeBucket.conditions[conditionId] =
              (memberBadgeBucket.conditions?.[conditionId] ?? 0) + 1;

            // Check if the count condition is met
            const isConditionMet = memberBadgeBucket.conditions?.[conditionId] >= condition.if.value;

            console.log(">> condition check 2", {
              conditionId,
              badgeName: this.appStateService.getAvailableBadge(networkId, badgeId)?.name,
              calculatedValue: memberBadgeBucket.conditions[conditionId],
              expectedValue: condition.if.value,
              isConditionMet
            });

            if (isConditionMet) {
              members[memberId].buckets[badgeId].metConditions.push(conditionId);
              members[memberId].badges.push(badgeId);
            }
          }
        });
      });
    });

    return members;
  }
  calculateBadgesToAssignAndRevoke(networkId: string, members: Members) {
    const badgesToAssign: Record<BadgeId, MemberId[]> = {};
    const badgesToRevoke: Record<BadgeId, MemberId[]> = {};

    // Diff the badge lists with what members have currently assigned
    Object.keys(members).forEach((memberId) => {
      const member = members[memberId];
      const previousBadges = member.previousBadges;
      const currentBadges = member.badges;
      const isMemberSuspended = this.appStateService.isMemberSuspended(networkId, memberId);

      const badgesToAssignForMember = _difference(currentBadges, previousBadges ?? []);
      const badgesToRevokeForMember = _difference(previousBadges ?? [], currentBadges);

      // if member is suspended calculate badges, revoke as usual,
      // but don't assign new badges to them until unsuspended
      if (badgesToAssignForMember.length > 0 && !isMemberSuspended) {
        badgesToAssignForMember.forEach((badgeId) => {
          if (!_has(badgesToAssign, badgeId)) {
            badgesToAssign[badgeId] = [];
          }
          if (!badgesToAssign[badgeId].includes(memberId)) {
            badgesToAssign[badgeId].push(memberId);
          }
        });
      }

      if (badgesToRevokeForMember.length > 0) {
        badgesToRevokeForMember.forEach((badgeId) => {
          if (!_has(badgesToRevoke, badgeId)) {
            badgesToRevoke[badgeId] = [];
          }
          if (!badgesToRevoke[badgeId].includes(memberId)) {
            badgesToRevoke[badgeId].push(memberId);
          }
        });
      }
    });

    return {
      badgesToAssign,
      badgesToRevoke,
    };
  }
  // async massAssignAndRevokeBadgesForMembersInBettermode(networkId: string, badgesToAssign: Record<BadgeId, MemberId[]>, badgesToRevoke: Record<BadgeId, MemberId[]>) {
  //   // Assign badges to members in bettermode
  //   Object.keys(badgesToAssign).forEach(async (badgeId) => {
  //     const memberIds = badgesToAssign[badgeId];
  //     await this.assignBadgesToMembersInBettermode(networkId, memberIds, [badgeId]);
  //     await new Promise((resolve) => setTimeout(resolve, 1000));
  //   });

  //   // Revoke badges from members in bettermode
  //   Object.keys(badgesToRevoke).forEach(async (badgeId) => {
  //     const memberIds = badgesToRevoke[badgeId];
  //     await this.revokeBadgesFromMembersInBettermode(networkId, memberIds, [badgeId]);
  //     await new Promise((resolve) => setTimeout(resolve, 1000));
  //   });
  // }
  async individuallyAssignAndRevokeBadgesForMembersInBettermode(networkId: string, badgesToAssign: Record<BadgeId, MemberId[]>, badgesToRevoke: Record<BadgeId, MemberId[]>) {
    this.logger.info("individuallyAssignAndRevokeBadgesForMembersInBettermode", { networkId, badgesToAssign, badgesToRevoke });
    const client = new BettermodeClient(networkId);

    // Assign badges to members in bettermode
    Object.keys(badgesToAssign).forEach(async (badgeId) => {
      const memberIds = badgesToAssign[badgeId];
      memberIds.forEach(async (memberId) => {
        await client.assignBadgeToMember(memberId, badgeId);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      });
    });

    // Revoke badges from members in bettermode
    Object.keys(badgesToRevoke).forEach(async (badgeId) => {
      const memberIds = badgesToRevoke[badgeId];
      memberIds.forEach(async (memberId) => {
        await client.revokeBadgeFromMember(memberId, badgeId);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      });
    });
  }

  // ✅ DONE
  // async assignBadgesToMembersInBettermode(networkId: string, memberIds: MemberId[], badges: BadgeId[]) {
  //   this.logger.info("Assigning badges to members in bettermode", { networkId, memberIds, badges });
  //   const client = new BettermodeClient(networkId);
  //   await client.assignBadgesToMembers(memberIds, badges);
  // }
  // ✅ DONE
  // async revokeBadgesFromMembersInBettermode(networkId: string, memberIds: MemberId[], badges: BadgeId[]) {
  //   this.logger.info("Revoking badges from members in bettermode", { networkId, memberIds, badges });
  //   const client = new BettermodeClient(networkId);
  //   await client.revokeBadgesFromMembers(memberIds, badges);
  // }

  static getInstance() {
    if (!BadgeOrchestrationService.instance) {
      BadgeOrchestrationService.instance = new BadgeOrchestrationService();
    }
    return BadgeOrchestrationService.instance;
  }
}