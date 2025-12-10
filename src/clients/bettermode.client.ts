import { GlobalClient } from "@tribeplatform/gql-client";
import { Logger } from "@tribeplatform/node-logger";
import { MemberFieldInput } from "@/types";
import { AppNetworkSettings, BadgeId, MemberId, PostDetails } from "@/types/app";

import { INITIAL_APP_NETWORK_SETTINGS } from "@/constants/app-settings.constants";
import { BADGE_CONDITION_LIMITS } from "@/constants/condition.constants";
import { AppAction, Badge, BadgeType, MassActionRequestAction, MassActionRequestContext, MemberListFilterByOperator, MutationCreateMassActionRequestArgs, MutationName, PaginatedPost, Post, PostListFilterByEnum, PostListFilterByOperator, PostListOrderByEnum } from "@tribeplatform/gql-client/types";

export class BettermodeClient {
  private global: GlobalClient;
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

    this.global = new GlobalClient({
      clientId: process.env.CLIENT_ID!,
      clientSecret: process.env.CLIENT_SECRET!,
      graphqlUrl: process.env.GRAPHQL_URL!,
      onError: (errors, client, error) => {
        // Log GraphQL errors using logger instead of console
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const errorDetails = errors?.map((e: unknown) => {
          if (e instanceof Error) return e.message;
          if (typeof e === "object" && e !== null && "message" in e) {
            return String((e as { message: unknown }).message);
          }
          return String(e);
        });
        this.logger.error("[Bettermode GQL Error]", {
          error: errorMessage,
          errors: errorDetails,
        });
      },
    });
  }

  async getAppNetworkSettings(): Promise<AppNetworkSettings> {
    const networkId = this.networkId!;
    const appId = this.appId!;
    try {
      const client = await this.global.getTribeClient({ networkId });
      const raw = await client.app.networkSettings({ appId }); // returns string
      console.log("getAppNetworkSettings", raw);
      return raw ? JSON.parse(raw) : {};
    } catch (error: unknown) {
      const errorMessage = (error as Error)?.message || String(error);
      if (
        errorMessage.includes("App not found") ||
        errorMessage.includes('code":"110"')
      ) {
        this.logger.error(
          "App authentication failed - please verify CLIENT_ID and CLIENT_SECRET are correct and the app is registered",
          { networkId, appId },
        );
      }
      this.logger.error("Error fetching app network settings", errorMessage);
      throw error;
    }
  }

  async updateAppNetworkSettings(settings: AppNetworkSettings): Promise<AppAction> {
    const networkId = this.networkId!;
    const appId = this.appId!;
    try {
      const client = await this.global.getTribeClient({ networkId });
      console.log("updateAppNetworkSettings", JSON.stringify(settings));
      const res = await client.app.updateNetworkSettings({
        appId,
        settings: JSON.stringify(settings),
      });

      return res;
    } catch (error: unknown) {
      this.logger.error(
        "Error updating app network settings",
        (error as Error)?.message || error,
      );
      throw error;
    }
  }

  

  /*
  async updateMember(
    memberId: string,
    networkId: string,
    fields: MemberFieldInput[],
  ) {
    try {
      const client = await this.global.getTribeClient({ networkId });
      const result = await client.members.update(
        {
          id: memberId,
          input: {
            fields: fields.map((f) => {
              let value = f.value;

              // For date fields, format as YYYY-MM-DD (date-only format)
              if (f.type === "date" || f.key.includes("date")) {
                if (value instanceof Date) {
                  // Format as YYYY-MM-DD
                  value = value.toISOString().split("T")[0];
                } else if (typeof value === "string") {
                  // If it's an ISO datetime string, extract just the date part
                  const date = new Date(value);
                  if (!isNaN(date.getTime())) {
                    value = date.toISOString().split("T")[0];
                  }
                }
              }

              // Convert value to JSON string as required by the API
              // All values must be JSON-serialized strings
              return {
                key: f.key,
                value: JSON.stringify(value),
              };
            }),
          },
        },
        "basic",
      );
      return result;
    } catch (error: unknown) {
      this.logger.error(
        "Error updating member",
        (error as Error)?.message || error,
      );
      throw error;
    }
  }
  */

  async getAllManualBadges(): Promise<Badge[]> {
    const networkId = this.networkId!;
    try {
      const client = await this.global.getTribeClient({ networkId });
      if (!client) {
        this.logger.error("Failed to get network client", { networkId });
        throw new Error("Failed to get network client");
      }

      const result = await client.network.get({ badges: "all" });

      if (!result?.badges) {
        this.logger.error("No badges found", { networkId });
        return [];
      }

      return result.badges.filter((badge: Badge) => badge.type === BadgeType.Manual);
    } catch (error: unknown) {
      const errorMessage = (error as Error)?.message || String(error);
      this.logger.error("Error fetching badges", errorMessage);
      throw error;
    }
  }

  /*
  async getAllPostsMatadata(
    pageSize?: number,
    delayMs?: number,
    maxPosts?: number,
    maxPostElapsedDays?: number,
  ): Promise<PostDetails[]> {
    const networkId = this.networkId!;
    try {
      const client = await this.global.getTribeClient({ networkId });
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

      this.logger.info("Starting post fetch", {
        networkId,
        maxPosts: maxPosts || "unlimited",
        maxPostElapsedDays: fetchMaxPostElapsedDays,
        pageSize: fetchPageSize,
        delayMs: fetchDelay,
      });

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

        // const result = await client.posts.list(
        //   {
        //     limit: currentLimit,
        //     after: endCursor || undefined,
        //     orderBy: PostListOrderByEnum.publishedAt,
        //     filterBy: [{
        //       key: PostListFilterByEnum.publishedAt,
        //       operator: PostListFilterByOperator.gte,
        //       value: `"${dateFilterValue}"`,
        //     }],
        //   },
        //   'basic'
        // );
        const query = `
        query {
          posts(
            limit: ${currentLimit},
            after: ${endCursor || undefined},
            orderBy: publishedAt,
            filterBy: [{
              key: publishedAt,
              operator: gte,
              value: "\"${dateFilterValue}\""
            }]
          ) {
            nodes {
              id
              publishedAt
              createdById
              isHidden
              status
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }`;
        const queryResult = await fetch(`https://api.bettermode.com`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${btoa(process.env.CLIENT_ID! + ':' + process.env.CLIENT_SECRET!)}`
          },
          body: JSON.stringify({ query }),
        });
        const result = await queryResult.json() as PaginatedPost;
        // const result = null;
        console.log("queryResult", queryResult);

        requestCount++;

        if (result?.nodes) {
          const fetchedMetadata: PostDetails[] = result.nodes.map((node: Post) => ({
            id: node.id,
            publishedAt: node.publishedAt,
            createdById: node.createdById,
            isHidden: node.isHidden,
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
  */

  async assignBadgesToMember(networkId: string, memberId: MemberId, badges: BadgeId[]) {
    try {
      const client = await this.global.getTribeClient({ networkId });
      // The generic type argument should match the function's signature: first is the operation name, second is the input type.
      // const massActionResult = await client.mutation<
      //   "createMassActionRequest"
      // >({
      //   name: "createMassActionRequest",
      //   args: {
      //     fields: {
      //       action: MassActionRequestAction.AssignBadge, // RevokeBadge
      //       context: MassActionRequestContext.Member,
      //       extraProperties: {
      //         badgeIds: badges,
      //       },
      //       filters: {
      //         filterBy: [
      //           {
      //             key: "id",
      //             operator: MemberListFilterByOperator.in,
      //             value: `"${memberId}"`,
      //           },
      //         ]
      //       }
      //     }
      //     },
      //     variables: {
      //       input: {},
      //     },
      //   });
    }
    catch (error: unknown) {
      this.logger.error("Error assigning badges to member", (error as Error)?.message || error);
      throw error;
    }
  }

  async removeBadgesFromMember(networkId: string, memberId: MemberId, badges: BadgeId[]) {
    try {
      const client = await this.global.getTribeClient({ networkId });
      // TODO: Implement this
      // const result = await client.members.removeBadges({
      //   memberId,
      //   badges,
      // });
    }
    catch (error: unknown) {
      this.logger.error("Error removing badges from member", (error as Error)?.message || error);
      throw error;
    }
  }
}
