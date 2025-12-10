import { Badge } from "@tribeplatform/gql-client/types";
import { Logger } from "@tribeplatform/node-logger";
import { AppStateService } from "./app-state.service";
import { BettermodeClient } from "@/clients/bettermode.client";
import { TimeWindowJobService } from "@/services/time-window-job.service";
import { BadgeCondition, BadgeConfig, BadgeId, MemberId, PostDetails, PostId } from "@/types/app";
import { INITIAL_APP_NETWORK_SETTINGS } from "@/constants/app-settings.constants";

export class BadgeOrchestrationService {
  static instance: BadgeOrchestrationService;
  private logger: Logger;
  private appStateService: AppStateService;
  private timeWindowJobService: TimeWindowJobService;

  constructor() {
    this.logger = new Logger({
      applicationName: process.env.LOGGING_APP_KEY!,
      context: "BadgeOrchestrationService",
    });
    this.appStateService = AppStateService.getInstance();
    this.timeWindowJobService = TimeWindowJobService.getInstance();
  }

  // Webhook handlers

  async handleAppInstalled(networkId: string) {
    // Fetch settings and available badges from Bettermode
    const bettermodeClient = new BettermodeClient(networkId);
    const appNetworkSettings = await bettermodeClient.getAppNetworkSettings();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const badges = await bettermodeClient.getAllManualBadges();

    console.log("appNetworkSettings", appNetworkSettings);

    // Update app state
    this.appStateService.setAppConfig(networkId, appNetworkSettings?.config || {});
    this.appStateService.setAvailableBadges(networkId, badges);

    // Fetch posts metadata (once rate limits are lifted)
    // const posts = await bettermodeClient.getAllPostsMatadata(100, 2000, 100);
    // this.appStateService.setPosts(networkId, posts);

    // Create time window shifting job
    this.timeWindowJobService.start(networkId, () => this.shiftTimeWindow(networkId));

    this.logger.info("✅ Successfully initialized the app", { networkId });
  }
  handleAppUninstalled(networkId: string) {
    // 1. Delete time window shifting job
    this.timeWindowJobService.stop(networkId);
    
    // 2. Delete app state
    this.appStateService.deleteAppState(networkId);

    this.logger.info("✅ Successfully cleaned up installation data", { networkId });
  }
 
  handleBadgeCreated(networkId: string, badge: Badge) {
    // Adding to available badges state.
    // It will now be available in Settings page to configure rules for.
    this.appStateService.setAvailableBadge(networkId, badge);
    this.logger.info("✅ Successfully added a newly created badge to app state", { networkId, badgeId: badge.id, badgeName: badge.name });
  }
  handleBadgeUpdated(networkId: string, badge: Badge) {
    const initialBadge = this.appStateService.getAvailableBadge(networkId, badge.id);

    // Checking if there was a change in active state
    if (initialBadge?.active !== badge.active) {
      this.logger.info("🔄 Badge active state changed", { networkId, badgeId: badge.id, badgeName: badge.name, initialActive: initialBadge?.active, newActive: badge.active });

      if (badge.active) {
        this.handleBadgeReactivated(networkId, badge.id);
      } else {
        this.handleBadgeDeactivated(networkId, badge.id);
      }
    }

    // Updating the badge in the app state
    // It will now be available in Settings page in its updated form
    this.appStateService.setAvailableBadge(networkId, badge);

    this.logger.info("✅ Successfully updated badge", { networkId, badgeId: badge.id, badgeName: badge.name });
  }
  handleBadgeReactivated(networkId: string, badgeId: string) {
    this.logger.info("🔄 Reactivated badge", { networkId, badgeId });
  }
  handleBadgeDeactivated(networkId: string, badgeId: string) {
    this.logger.info("🔄 Deactivated badge", { networkId, badgeId });
  }
  handleBadgeDeleted(networkId: string, badge: Badge) {
    this.appStateService.deleteAvailableBadge(networkId, badge.id);
    this.logger.info("✅ Successfully deleted badge", { networkId, badgeId: badge.id, badgeName: badge.name });
  }

  handleMemberSuspended(networkId: string, memberId: string) {
    this.logger.info("Member suspended", { networkId, memberId });

    // 1. Add the memberId to the SUSPENDED_MEMBERS list in app state.
    // 1.1. We still incremenet/decrement buckets for them, and calculate badges
    //      so that when they are unsuspended, we can re-apply the up-to-date badges
    // 1.2. We do not apply badges to these members while they are suspended.
    this.appStateService.addSuspendedMember(networkId, memberId);

    // 2. Get currently configured badges for the member
    const badges: BadgeId[] = this.appStateService.getMemberBadges(networkId, memberId);

    // 3. Remove any configured badges from the member in bettermode
    this.removeBadgesFromMemberInBettermode(networkId, memberId, badges);
  }
  handleMemberUnsuspended(networkId: string, memberId: string) {
    this.logger.info("Member unsuspended", { networkId, memberId });

    // 1. Remove the memberId from the SUSPENDED_MEMBERS list in app state
    this.appStateService.removeSuspendedMember(networkId, memberId);
    
    // 2. Get member's calculated badges
    const badges: BadgeId[] = this.appStateService.getMemberBadges(networkId, memberId);
    
    // 3. Apply the badges to the member in bettermode
    this.addBadgesToMemberInBettermode(networkId, memberId, badges);
  }

  handlePostChangesReceived(networkId: string, post: PostDetails) {
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

    // Add/Update the post details in the app state in the correct places
    this.appStateService.setPost(networkId, post);

    // 3. Use the badge configs to INCREMENT/DECREMENT any affected badge buckets
    // 4. Use the affected badge buckets to calculate the final badges
    
    // TODO: This is not performant, but calculating all badges for demo app
    this.calculateBadges(networkId);
    
    if (!this.appStateService.isMemberSuspended(networkId, memberId)) {
      // Get member's calculated badges
      const badges: BadgeId[] = this.appStateService.getMemberBadges(networkId, memberId);
      
      // Apply the final badges to the member
      this.addBadgesToMemberInBettermode(networkId, memberId, badges);
    }
  }


  // Interaction Handlers
  async handleBadgeConfigSaved(networkId: string, badgeConfig: BadgeConfig) {
    this.logger.info("Badge config saved", { networkId, badgeConfig });

    // Update the badge config in the app state
    this.appStateService.setBadgeConfig(networkId, badgeConfig);

    // Save badge config to bettermode
    const client = new BettermodeClient(networkId);
    console.log("before updateAppNetworkSettings", { config: this.appStateService.getAppConfig(networkId) });
    await client.updateAppNetworkSettings({ config: this.appStateService.getAppConfig(networkId) });

    // Calculate the badges for the network
    const affectedMembers = this.calculateBadges(networkId);

    // TODO: Apply the badges to the members in bettermode
    // this.addBadgesToMemberInBettermode(networkId, memberId, badges);
  }


  // Cron Job Handlers
  shiftTimeWindow(networkId: string) {
    try {
      this.logger.info("Starting nightly time window shifting for network", { networkId });
      // 1. Check which posts have expired from the time window
      // 1.1. Iterate over posts in order of dates
      // 1.2. Check if the post is expired from the MAX time window
        // If expired, track the affected member
        // Decrement the affected member's applicable badge buckets
        // Calculate the final badges for the affected member
        // Apply the final badges to the member
        // Remove the post details from app state
      // 1.3. Check which badgeconfig conditions is the post expired for
        // If the post is expired, track the affected member
        // Decrement the affected member's badge buckets
        // Calculate the final badges for the affected member
        // Apply the final badges to the member

      // for each expired post, do the following:
        // If expired, track the affected member
        // Decrement the affected member's applicable badge buckets
      // make note of the affected members
        // Calculate the final badges for the affected members
        // Apply the final badges to the members
      
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
  // TODO: This is not performant, but calculating all badges for demo app
  calculateBadges(networkId: string): MemberId[] {
    const appConfig = this.appStateService.getAppConfig(networkId);
    const posts = this.appStateService.getPosts(networkId);
    const availableBadges = this.appStateService.getAvailableBadges(networkId);
    const members = this.appStateService.getMembers(networkId);
    const currentTime = new Date().getTime();

    const affectedMembers: MemberId[] = [];

    posts.forEach((post) => {
      const isPostVisible = post.isHidden !== true && post.status === "PUBLISHED";
      if (!isPostVisible) {
        return;
      }

      const memberId = post.createdById;
      const publishedAt = new Date(String(post.publishedAt)).getTime();

      Object.keys(appConfig).forEach((badgeConfigId) => {
        const badgeConfig = appConfig[badgeConfigId];
        let conditionsAreMet = true;
        
        Object.keys(badgeConfig.conditions).find((conditionId) => {
          const condition = badgeConfig.conditions[conditionId];
          let isConditionUnmet = false;

          // Check 
          
          return isConditionUnmet;
        });
      });
    });

    return affectedMembers;
  }

  // incrementBucketsForPost(networkId: string, post: PostDetails) {
  //   const memberId = post.createdById;
  //   // 1. Calculate the value of the condition
  //   // 2. Return the value
  //   return memberId;
  // }
  // decrementBucketsForPost(networkId: string, post: PostDetails) {
  //   const memberId = post.createdById;
  //   return memberId;
  // }

  async addBadgesToMemberInBettermode(networkId: string, memberId: string, badges: BadgeId[]) {
    this.logger.info("Applying badges to member in bettermode", { networkId, memberId, badges });
    // Use the bettermode client to assign the badges to the member
    const client = new BettermodeClient(networkId);
    await client.assignBadgesToMember(networkId, memberId, badges);
    this.logger.info("Successfully applied badges to member in bettermode", { networkId, memberId, badges });
  }
  async removeBadgesFromMemberInBettermode(networkId: string, memberId: string, badges: BadgeId[]) {
    this.logger.info("Removing badges from member in bettermode", { networkId, memberId, badges });
    // Use the bettermode client to remove the badges from the member
    const client = new BettermodeClient(networkId);
    await client.removeBadgesFromMember(networkId, memberId, badges);
    this.logger.info("Successfully removed badges from member in bettermode", { networkId, memberId, badges });
  }

  static getInstance() {
    if (!BadgeOrchestrationService.instance) {
      BadgeOrchestrationService.instance = new BadgeOrchestrationService();
    }
    return BadgeOrchestrationService.instance;
  }
}