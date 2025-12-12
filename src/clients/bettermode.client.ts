import { Logger } from "@tribeplatform/node-logger";
import { graphql, gqlClient } from "@/gql";
import { MemberFieldInput } from "@/types";
import { AppNetworkSettings, BadgeId, MemberId, PostDetails } from "@/types/app";

import { INITIAL_APP_NETWORK_SETTINGS } from "@/constants/app-settings.constants";
import { BADGE_CONDITION_LIMITS } from "@/constants/condition.constants";
import { AppAction, Badge, BadgeType, ActionStatus, MassActionRequestAction, MassActionRequestContext, MassActionRequestStatus, MemberListFilterByOperator, MutationCreateMassActionRequestArgs, MutationName, PaginatedPost, Post, PostListFilterByEnum, PostListFilterByOperator, PostListOrderByEnum, PaginatedAppInstallation } from "@tribeplatform/gql-client/types";
import { ResultOf, VariablesOf } from "gql.tada";

export class BettermodeClient {
  private logger: Logger;
  private networkId: string;
  private appId: string;

  constructor(networkId: string) {
    // Initialize logger first so it can be used in onError callback
    this.logger = new Logger({
      applicationName: process.env.LOGGING_APP_KEY!,
      context: "BettermodeClient",
    });

    this.networkId = networkId;
    this.appId = process.env.APP_ID!;

    if (!this.networkId || !this.appId) {
      this.logger.error("[Bettermode Client Error]", {
        error: "Network ID and app ID are required"
      });
    }
  }

  static async getNetworkAppInstallations(): Promise<string[]> {
    const appId = process.env.APP_ID!;
    
    try {
      const networkAppInstallationsQuery = graphql(`
        query {
          networkAppInstallations (
            offset: 0,
            limit: 10,
            status: ENABLED
          ) {
            nodes {
              id
              app {
                id
              }
              network {
                id
              }
            }
            totalCount
          }
        }
      `);

      interface AppNetworkSettingsQueryResult {
        networkAppInstallations: PaginatedAppInstallation;
      }
      
      const { networkAppInstallations: response }: AppNetworkSettingsQueryResult =
        await gqlClient.request<AppNetworkSettingsQueryResult, VariablesOf<typeof networkAppInstallationsQuery>>(networkAppInstallationsQuery);
      
      const appIds = response?.nodes?.map((node: any) => node.app.id) ?? [];
      const networkIds = response?.nodes?.map((node: any) => node.network.id) ?? [];

      return networkIds;
    } catch (error: unknown) {
      const errorMessage = (error as Error)?.message || String(error);
      console.error("Error fetching app settings", errorMessage);
      return [];
    }
  }

  async getAppNetworkSettings(): Promise<AppNetworkSettings> {
    const appId = this.appId!;
    
    try {
      const appSettingsQuery = graphql(`
        query ($appId: ID!) {
          getAppNetworkSettings (appId: $appId)
        }
      `);

      interface AppNetworkSettingsQueryResult {
        getAppNetworkSettings: string;
      }
      
      const { getAppNetworkSettings: raw }: AppNetworkSettingsQueryResult = await gqlClient.request<AppNetworkSettingsQueryResult, VariablesOf<typeof appSettingsQuery>>(appSettingsQuery, { appId });
      return raw ? JSON.parse(raw) : {};
    } catch (error: unknown) {
      const errorMessage = (error as Error)?.message || String(error);
      this.logger.error("Error fetching app settings", errorMessage);
      return {};
    }
  }

  async updateAppNetworkSettings(settings: AppNetworkSettings): Promise<AppAction> {
    const appId = this.appId!;

    try {
      const updateAppSettingsQuery = graphql(`
        mutation ($appId: ID!, $settings: String!) {
          updateAppNetworkSettings (appId: $appId, settings: $settings) {
            data
            status
          }
        }
      `);

      interface UpdateAppNetworkSettingsMutationResult {
        updateAppNetworkSettings: {
          data: string;
          status: ActionStatus;
        }
      }

      const response: UpdateAppNetworkSettingsMutationResult =
        await gqlClient.request<UpdateAppNetworkSettingsMutationResult, VariablesOf<typeof updateAppSettingsQuery>>(
          updateAppSettingsQuery, {
            appId,
            settings: JSON.stringify(settings)
          }
        );

      return response.updateAppNetworkSettings;
    } catch (error: unknown) {
      const errorMessage = (error as Error)?.message || String(error);
      this.logger.error("Error updating app settings", errorMessage);
      throw error;
    }
  }

  async getAllManualBadges(): Promise<Badge[]> {
    const networkId = this.networkId!;
    try {
      const badgesQuery = graphql(`
        query getAvailableBadges {
          network {
            badges {
              active
              backgroundColor
              daysUntilExpired
              id
              imageId
              longDescription
              name
              networkId
              settings {
                key, value
              }
              shortDescription
              text
              textColor
              type
            }
          }
        }
      `);

      interface GetAvailableBadgesQueryResult {
        network: {
          badges: Badge[];
        };
      }
      
      const { network: { badges } }: GetAvailableBadgesQueryResult = await gqlClient.request<GetAvailableBadgesQueryResult, VariablesOf<typeof badgesQuery>>(badgesQuery);

      if (!badges) {
        this.logger.error("No badges found", { networkId });
        return [];
      }

      return badges.filter((badge: Badge) => badge.type === BadgeType.Manual);
    } catch (error: unknown) {
      const errorMessage = (error as Error)?.message || String(error);
      this.logger.error("Error fetching badges", errorMessage);
      throw error;
    }
  }

  async getAllPostsMatadata(
    pageSize?: number,
    delayMs?: number,
    maxPosts?: number,
    maxPostElapsedDays?: number,
  ): Promise<PostDetails[]> {
    const networkId = this.networkId!;
    try {
      const posts: PostDetails[] = [];
      let hasNextPage = true;
      let endCursor: string | null = null;
      let requestCount = 0;

      const fetchMaxPostElapsedDays = maxPostElapsedDays || BADGE_CONDITION_LIMITS.POST_DAYS_WINDOW_LIMIT;
      const fetchMaxPostElapsedDaysTs = fetchMaxPostElapsedDays * 24 * 60 * 60 * 1000;
      const currentDateTs = new Date().getTime();
      const dateFilterValue = new Date(currentDateTs - fetchMaxPostElapsedDaysTs).toISOString()

      // Use default page size from constants if not provided
      // Reduced page size and increased delay to respect Bettermode rate limits
      const fetchPageSize = pageSize || 10;
      const fetchDelay = delayMs || 2000; // Default 2 seconds to stay under burst limits

      const postsQuery = graphql(`
        query (
          $limit: Int!,
          $after: String,
          $dateFilterValue: String!
        ) {
          posts(
            limit: $limit,
            after: $after,
            orderBy: publishedAt,
            filterBy: [{
              key: publishedAt,
              operator: gte,
              value: $dateFilterValue
            }]
          ) {
            nodes {
              id
              title
              publishedAt
              createdById
              isHidden
              isAnonymous
              status
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `);

      interface PostsQueryResult {
        posts: PaginatedPost;
      }

      while (hasNextPage) {
        // Stop if we've reached the max posts limit
        if (maxPosts && posts.length >= maxPosts) {
          this.logger.info("Reached max posts limit", {
            maxPosts,
            fetched: posts.length,
          });
          break;
        }

        // Stop if we've reached the max post elapsed days (e.g. got all posts from last month)
        // const lastPostTs = posts.length > 0 ? new Date(posts[posts.length - 1].publishedAt).getTime() : null;
        // if (lastPostTs && currentDateTs - lastPostTs > fetchMaxPostElapsedDaysTs) {
        //   this.logger.info("Reached max post elapsed days limit", {
        //     maxPostElapsedDays: fetchMaxPostElapsedDays,
        //     lastPostDate: new Date(lastPostTs).toISOString(),
        //     fetched: posts.length,
        //   });
        //   break;
        // }

        // Calculate actual limit for this request
        const currentLimit: number = maxPosts
          ? Math.min(fetchPageSize, maxPosts - posts.length)
          : fetchPageSize;

        const { posts: result }: PostsQueryResult = await gqlClient.request<PostsQueryResult, VariablesOf<typeof postsQuery>>(postsQuery, {
          limit: currentLimit,
          after: endCursor || undefined,
          dateFilterValue: `"${dateFilterValue}"`
        });

        requestCount++;

        if (result?.nodes) {
          const fetchedMetadata: PostDetails[] = result.nodes.map((node: Post) => ({
            id: node.id,
            title: node.title,
            publishedAt: node.publishedAt,
            createdById: node.createdById,
            isHidden: node.isHidden,
            isAnonymous: node.isAnonymous,
            status: node.status,
          }));
          posts.push(...fetchedMetadata);

          this.logger.debug("Fetched posts batch", {
            batchSize: result.nodes.length,
            totalFetched: posts.length,
            requestCount,
          });
        }

        hasNextPage = result?.pageInfo?.hasNextPage || false;
        endCursor = result?.pageInfo?.endCursor || null;

        // Add delay between requests to avoid rate limits (except for the last request)
        // Posts query has high complexity, so we need longer delays
        if (hasNextPage && fetchDelay > 0) {
          await new Promise((resolve) => setTimeout(resolve, fetchDelay));
        }

        // Additional delay after each page to respect burst limits (10 second window)
        // High complexity queries need more spacing
        if (hasNextPage) {
          await new Promise((resolve) => setTimeout(resolve, 1000)); // Extra 1 second buffer
        }
      }

      this.logger.info("Finished fetching posts", {
        totalPosts: posts.length,
        requestCount,
        networkId,
      });

      // Return limited results if maxPosts was specified
      return maxPosts ? posts.slice(0, maxPosts) : posts;
    } catch (error: unknown) {
      this.logger.error(
        "Error fetching posts",
        (error as Error)?.message || error,
      );
      throw error;
    }
  }

  async assignBadgeToMember(memberId: MemberId, badgeId: BadgeId) {
    try {
      const assignBadgeMutation = graphql(`
        mutation (
          $badgeId: String!,
          $memberId: String!
        ) {
          assignBadge (
            id: $badgeId,
            input: {
              memberId: $memberId
            }
          ) {
            status
          }
        }
      `);

      const { assignBadge: { status } } = await gqlClient.request(assignBadgeMutation, {
        badgeId,
        memberId
      });

      if (status === ActionStatus.failed) {
        throw new Error("Failed to assign badge to member");
      } else {
        this.logger.info("Status of assigning badge to member", { status, memberId, badgeId });
      }
    }
    catch (error: unknown) {
      this.logger.error("Error assigning badge to member", (error as Error)?.message || error);
      throw error;
    }
  }

  async revokeBadgeFromMember(memberId: MemberId, badgeId: BadgeId) {
    try {
      const revokeBadgeMutation = graphql(`
        mutation (
          $badgeId: String!,
          $memberId: String!
        ) {
          revokeBadge (
            id: $badgeId,
            input: {
              memberId: $memberId
            }
          ) {
            status
          }
        }
      `);

      const { revokeBadge: { status } } = await gqlClient.request(revokeBadgeMutation, {
        badgeId,
        memberId: memberId
      });

      if (status === ActionStatus.failed) {
        throw new Error("Failed to revoke badge from member");
      } else {
        this.logger.info("Status of revoking badge from member", { status, memberId, badgeId });
      }
    }
    catch (error: unknown) {
      this.logger.error("Error revoking badge from member", (error as Error)?.message || error);
      throw error;
    }
  }

  async assignBadgesToMembers(memberIds: MemberId[], badges: BadgeId[]) {
    try {
      const assignBadgesToMembersMutation = graphql(`
        mutation assignBadgesToMembers (
          $badgeIds: [ID!],
          $memberIds: String!
        ) {
          createMassActionRequest(
            input: {
              action: AssignBadge,
              context: Member,
              extraProperties: {
                badgeIds: $badgeIds
              },
              filters: {
                filterBy: [
                  {
                    key: "id",
                    operator: in,
                    value: $memberIds
                  }
                ]
              }
            }
          ) {
            entitiesCount
            failedCount
            processedCount
            status
          }
        }
      `);

      const massActionResult = await gqlClient.request(assignBadgesToMembersMutation, {
        badgeIds: badges,
        memberIds: JSON.stringify(memberIds)
      });

      if (massActionResult.createMassActionRequest.status === MassActionRequestStatus.Failed) {
        throw new Error("Failed to assign badges to members");
      } else {
        this.logger.info("Status of assigning badges to members", { status: massActionResult.createMassActionRequest.status, memberIds, badges });
      }
    }
    catch (error: unknown) {
      this.logger.error("Error assigning badges to members", (error as Error)?.message || error);
      throw error;
    }
  }

  async revokeBadgesFromMembers(memberIds: MemberId[], badges: BadgeId[]) {
    try {
      const revokeBadgesFromMembersMutation = graphql(`
        mutation revokeBadgesFromMembers (
          $badgeIds: [ID!],
          $memberIds: String!
        ) {
          createMassActionRequest(
            input: {
              action: RevokeBadge,
              context: Member,
              extraProperties: {
                badgeIds: $badgeIds
              },
              filters: {
                filterBy: [
                  {
                    key: "id",
                    operator: in,
                    value: $memberIds
                  }
                ]
              }
            }
          ) {
            entitiesCount
            failedCount
            processedCount
            status
          }
        }
      `);

      const massActionResult = await gqlClient.request(revokeBadgesFromMembersMutation, {
        badgeIds: badges,
        memberIds: JSON.stringify(memberIds)
      });

      if (massActionResult.createMassActionRequest.status === MassActionRequestStatus.Failed) {
        throw new Error("Failed to revoke badges from members");
      } else {
        this.logger.info("Status of revoking badges from members", { status: massActionResult.createMassActionRequest.status, memberIds, badges });
      }
    }
    catch (error: unknown) {
      this.logger.error("Error revoking badges from members", (error as Error)?.message || error);
      throw error;
    }
  }
}
