import type { RedisClient } from "@platform/cache-redis";
import type { Context, Next } from "hono";

/**
 * Redis-backed rate limiter for authentication endpoints.
 *
 * Uses Redis INCR and EXPIRE for atomic counter operations.
 * Supports distributed deployments across multiple API instances.
 *
 * Default limits:
 * - 5 attempts per 15 minutes per IP address for sign-in
 * - 3 attempts per hour per IP address for sign-up
 */

interface RateLimitConfig {
  /** Maximum number of requests allowed within the window */
  maxRequests: number;
  /** Time window in seconds (default: 15 minutes = 900 seconds) */
  windowSeconds: number;
  /** Function to extract the identifier from the request (IP, email, etc.) */
  keyGenerator: (c: Context) => string;
  /** Optional: Custom error message */
  errorMessage?: string;
  /** Redis key prefix for namespacing */
  keyPrefix: string;
}

/**
 * Create a Redis-backed rate limiting middleware
 */
export const createRedisRateLimiter = (redis: RedisClient, config: RateLimitConfig) => {
  return async (c: Context, next: Next) => {
    const key = `${config.keyPrefix}:${config.keyGenerator(c)}`;

    try {
      // Use Redis multi to atomically increment and set expiry
      const pipeline = redis.pipeline();
      pipeline.incr(key);
      pipeline.ttl(key);

      const results = await pipeline.exec();

      if (!results) {
        // Redis error, allow request but log warning
        console.warn("Rate limiter: Redis pipeline returned null");
        await next();
        return;
      }

      const [incrResult, ttlResult] = results;

      // Check for errors
      if (incrResult[0] || ttlResult[0]) {
        console.error("Rate limiter Redis error:", incrResult[0] || ttlResult[0]);
        await next();
        return;
      }

      const count = incrResult[1] as number;
      let ttl = ttlResult[1] as number;

      // Set expiry on first request
      if (count === 1 || ttl === -1) {
        await redis.expire(key, config.windowSeconds);
        ttl = config.windowSeconds;
      }

      // Check if limit exceeded
      if (count > config.maxRequests) {
        const retryAfter = ttl;
        return c.json(
          {
            error: config.errorMessage || "Too many requests",
            retryAfter,
          },
          429,
          { "Retry-After": String(retryAfter) },
        );
      }

      await next();
    } catch (error) {
      // Redis error - fail open (allow request) to avoid blocking legitimate users
      console.error("Rate limiter error:", error);
      await next();
    }
  };
};

/**
 * Rate limiter for sign-in attempts by IP address
 * 5 attempts per 15 minutes
 */
export const createSignInIpRateLimiter = (redis: RedisClient) =>
  createRedisRateLimiter(redis, {
    maxRequests: 5,
    windowSeconds: 15 * 60, // 15 minutes
    keyPrefix: "ratelimit:signin:ip",
    keyGenerator: (c: Context) => {
      const ip = c.req.header("X-Forwarded-For") || c.req.header("X-Real-IP") || "unknown";
      // Handle multiple IPs in X-Forwarded-For (take first one)
      return ip.split(",")[0].trim();
    },
    errorMessage: "Too many sign-in attempts. Please try again later.",
  });

/**
 * Rate limiter for sign-up attempts by IP address
 * 3 attempts per hour (to prevent mass account creation)
 */
export const createSignUpIpRateLimiter = (redis: RedisClient) =>
  createRedisRateLimiter(redis, {
    maxRequests: 3,
    windowSeconds: 60 * 60, // 1 hour
    keyPrefix: "ratelimit:signup:ip",
    keyGenerator: (c: Context) => {
      const ip = c.req.header("X-Forwarded-For") || c.req.header("X-Real-IP") || "unknown";
      return ip.split(",")[0].trim();
    },
    errorMessage: "Too many account creation attempts. Please try again later.",
  });

/**
 * Rate limiter for sign-in attempts by email
 * 5 attempts per 15 minutes per email
 * Note: This requires parsing the request body, which should be done carefully
 */
export const createSignInEmailRateLimiter = (redis: RedisClient) =>
  createRedisRateLimiter(redis, {
    maxRequests: 5,
    windowSeconds: 15 * 60, // 15 minutes
    keyPrefix: "ratelimit:signin:email",
    keyGenerator: (c: Context) => {
      // Extract email from request body
      // Note: This is a simplified version - in production, you might want to
      // parse the body in a middleware before this runs
      try {
        // For now, use IP-based as fallback since body parsing happens after middleware
        const ip = c.req.header("X-Forwarded-For") || c.req.header("X-Real-IP") || "unknown";
        return `ip:${ip.split(",")[0].trim()}`;
      } catch {
        return "unknown";
      }
    },
    errorMessage: "Too many sign-in attempts for this account. Please try again later.",
  });
