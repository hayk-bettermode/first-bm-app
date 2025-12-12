/**
 * Constants for badge condition limits
 */

const POST_DAYS_WINDOW_LIMIT = parseInt(
  process.env.POST_DAYS_WINDOW_LIMIT || "31",
  10,
)

export const BADGE_CONDITION_LIMITS = {
  // Total number of days to consider for post count condition
  POST_DAYS_WINDOW_LIMIT,
  POST_DAYS_WINDOW_LIMIT_MS: POST_DAYS_WINDOW_LIMIT * 24 * 60 * 60 * 1000, // Convert days to milliseconds

  // Total number of posts to consider for member count condition
  MEMBER_POSTS_LIMIT: parseInt(
    process.env.MEMBER_POSTS_LIMIT || "50",
    10,
  ),
} as const;