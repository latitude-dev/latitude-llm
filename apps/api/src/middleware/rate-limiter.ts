import type { Context, Next } from "hono";

/**
 * Simple in-memory rate limiter for authentication endpoints.
 *
 * For production use, this should be replaced with a Redis-backed rate limiter
to support distributed deployments.
 *
 * Default limits:
 * - 5 attempts per 15 minutes per IP address
 * - 5 attempts per 15 minutes per email (for sign-in)
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

interface RateLimitConfig {
  /** Maximum number of requests allowed within the window */
  maxRequests: number;
  /** Time window in milliseconds (default: 15 minutes) */
  windowMs: number;
  /** Function to extract the identifier from the request (IP, email, etc.) */
  keyGenerator: (c: Context) => string;
  /** Optional: Custom error message */
  errorMessage?: string;
}

// In-memory store for rate limit tracking
// For production, replace with Redis or similar distributed store
const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Clean up expired entries periodically to prevent memory leaks
 */
const cleanupExpiredEntries = (): void => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetTime <= now) {
      rateLimitStore.delete(key);
    }
  }
};

// Run cleanup every 5 minutes
setInterval(cleanupExpiredEntries, 5 * 60 * 1000);

/**
 * Create a rate limiting middleware
 */
export const createRateLimiter = (config: RateLimitConfig) => {
  return async (c: Context, next: Next) => {
    const key = config.keyGenerator(c);
    const now = Date.now();

    const entry = rateLimitStore.get(key);

    if (!entry || entry.resetTime <= now) {
      // New window or expired window
      rateLimitStore.set(key, {
        count: 1,
        resetTime: now + config.windowMs,
      });
      await next();
      return;
    }

    // Within active window
    if (entry.count >= config.maxRequests) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      return c.json(
        {
          error: config.errorMessage || "Too many requests",
          retryAfter,
        },
        429,
        { "Retry-After": String(retryAfter) },
      );
    }

    // Increment counter
    entry.count++;
    await next();
  };
};

/**
 * Rate limiter for sign-in attempts by IP address
 * 5 attempts per 15 minutes
 */
export const signInIpRateLimiter = createRateLimiter({
  maxRequests: 5,
  windowMs: 15 * 60 * 1000, // 15 minutes
  keyGenerator: (c: Context) => {
    const ip = c.req.header("X-Forwarded-For") || c.req.header("X-Real-IP") || "unknown";
    return `signin:ip:${ip}`;
  },
  errorMessage: "Too many sign-in attempts. Please try again later.",
});

/**
 * Rate limiter for sign-in attempts by email
 * 5 attempts per 15 minutes per email
 */
export const signInEmailRateLimiter = (getEmail: (c: Context) => string | null) => {
  return createRateLimiter({
    maxRequests: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
    keyGenerator: (c: Context) => {
      const email = getEmail(c);
      if (!email) return "signin:email:unknown";
      return `signin:email:${email.toLowerCase()}`;
    },
    errorMessage: "Too many sign-in attempts for this account. Please try again later.",
  });
};

/**
 * Rate limiter for sign-up attempts by IP address
 * 3 attempts per hour (to prevent mass account creation)
 */
export const signUpIpRateLimiter = createRateLimiter({
  maxRequests: 3,
  windowMs: 60 * 60 * 1000, // 1 hour
  keyGenerator: (c: Context) => {
    const ip = c.req.header("X-Forwarded-For") || c.req.header("X-Real-IP") || "unknown";
    return `signup:ip:${ip}`;
  },
  errorMessage: "Too many account creation attempts. Please try again later.",
});
