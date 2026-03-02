import type { RedisClient } from "@platform/cache-redis";
import { parseEnvOptional } from "@platform/env";
import { Effect } from "effect";
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
const createRedisRateLimiter = (redis: RedisClient, config: RateLimitConfig) => {
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
        await next();
        return;
      }

      const [incrResult, ttlResult] = results;

      // Check for errors
      if (incrResult[0] || ttlResult[0]) {
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
    } catch (_error) {
      // Redis error - fail open (allow request) to avoid blocking legitimate users
      await next();
    }
  };
};

/**
 * Rate limiter for sign-up attempts by IP address
 * 3 attempts per hour in production, 100 attempts per hour in development (to prevent mass account creation)
 */
export const createSignUpIpRateLimiter = (redis: RedisClient) => {
  // In development, be more permissive
  const nodeEnv = Effect.runSync(parseEnvOptional(process.env.NODE_ENV, "string")) ?? "development";
  const isDevelopment = nodeEnv === "development";

  return createRedisRateLimiter(redis, {
    maxRequests: isDevelopment ? 100 : 3,
    windowSeconds: 60 * 60, // 1 hour
    keyPrefix: "ratelimit:signup:ip",
    keyGenerator: (c: Context) => {
      const ip = c.req.header("X-Forwarded-For") || c.req.header("X-Real-IP") || "unknown";
      return ip.split(",")[0].trim();
    },
    errorMessage: "Too many account creation attempts. Please try again later.",
  });
};
