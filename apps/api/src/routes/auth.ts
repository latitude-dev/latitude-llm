import type { RedisClient } from "@platform/cache-redis";
import type { User } from "better-auth";
import { Hono } from "hono";
import { createSignUpIpRateLimiter } from "../middleware/rate-limiter.js";

/**
 * Auth routes for Better Auth
 *
 * Mounts Better Auth handlers and provides CLI-specific endpoints.
 *
 * Better Auth provides the following endpoints:
 * - POST /auth/sign-in/social - Initiate OAuth sign in
 * - POST /auth/sign-in/social/callback - OAuth callback
 * - GET /auth/session - Get current session
 * - POST /auth/sign-out - Sign out
 * - POST /auth/organization/create - Create organization (workspace)
 * - POST /auth/organization/invite-member - Invite member to organization
 * - GET /auth/organization/list - List user's organizations
 *
 * CLI-specific endpoints added:
 * - POST /auth/sign-up/email - Email/password sign up (returns JSON)
 * - POST /auth/sign-in/email - Email/password sign in (returns JSON)
 */

// Type for the auth API object from Better Auth
// Matches the actual Better Auth API structure
interface BetterAuthAPI {
  signUpEmail: (options: {
    body: { email: string; password: string; name: string };
    headers?: Headers;
  }) => Promise<{ token: string; user: User } | { token: null; user: User }>;
  signInEmail: (options: {
    body: { email: string; password: string };
    headers?: Headers;
  }) => Promise<{ token: string; user: User } | { token: null; user: User }>;
}

export interface AuthRouteDeps {
  /**
   * Better Auth handlers for mounting
   */
  readonly betterAuthHandler: (req: Request) => Promise<Response>;

  /**
   * Better Auth API for programmatic access
   */
  readonly betterAuthApi: BetterAuthAPI | undefined;

  /**
   * Redis client for rate limiting (required)
   */
  readonly redis: RedisClient;

  /**
   * Callback after successful OAuth sign in
   */
  readonly onOAuthCallback?: (user: User, provider: string) => Promise<void>;

  /**
   * Base URL for redirects
   */
  readonly baseUrl?: string;
}

/**
 * Create auth routes for Better Auth
 *
 * This mounts the Better Auth handlers at /auth/* and adds CLI-specific endpoints.
 */
export const createAuthRoutes = (deps: AuthRouteDeps) => {
  const app = new Hono();
  const baseUrl = deps.baseUrl ?? "http://localhost:3000";

  // Create rate limiters with Redis (required)
  const signUpRateLimiter = createSignUpIpRateLimiter(deps.redis);
  // Note: Using same rate limiter for sign-in (can be separated later if needed)

  // CLI-specific: POST /auth/sign-up/email - Email/password sign up
  // Returns JSON instead of redirect (for CLI tools)
  app.post("/sign-up/email", signUpRateLimiter, async (c) => {
    if (!deps.betterAuthApi) {
      return c.json({ error: "Email/password authentication not configured" }, 503);
    }

    try {
      const body = (await c.req.json()) as {
        readonly email: string;
        readonly password: string;
        readonly name: string;
      };

      // Validate required fields
      if (!body.email || typeof body.email !== "string") {
        return c.json({ error: "Email is required", field: "email" }, 400);
      }
      if (!body.password || typeof body.password !== "string") {
        return c.json({ error: "Password is required", field: "password" }, 400);
      }
      if (!body.name || typeof body.name !== "string") {
        return c.json({ error: "Name is required", field: "name" }, 400);
      }

      // Validate password length
      if (body.password.length < 8) {
        return c.json({ error: "Password must be at least 8 characters", field: "password" }, 400);
      }
      if (body.password.length > 128) {
        return c.json({ error: "Password must not exceed 128 characters", field: "password" }, 400);
      }

      // Call Better Auth API
      const result = await deps.betterAuthApi.signUpEmail({
        body: {
          email: body.email,
          password: body.password,
          name: body.name,
        },
        headers: c.req.raw.headers,
      });

      if (!result.token) {
        return c.json({ error: "Failed to create account" }, 500);
      }

      // Return token and user info for CLI storage
      return c.json(
        {
          token: result.token,
          user: {
            id: result.user.id,
            email: result.user.email,
            name: result.user.name,
            emailVerified: result.user.emailVerified,
          },
        },
        201,
      );
    } catch (error) {
      // Handle specific Better Auth errors
      if (error instanceof Error) {
        const message = error.message.toLowerCase();
        if (message.includes("email already exists") || message.includes("user already exists")) {
          return c.json({ error: "Email already registered" }, 409);
        }
        if (message.includes("invalid email")) {
          return c.json({ error: "Invalid email address", field: "email" }, 400);
        }
        if (message.includes("password")) {
          return c.json({ error: error.message, field: "password" }, 400);
        }
      }

      // Log unexpected errors for debugging
      console.error("Sign up error:", error);
      return c.json({ error: "Internal server error" }, 500);
    }
  });

  // CLI-specific: POST /auth/sign-in/email - Email/password sign in
  // Returns JSON instead of redirect/cookies (for CLI tools)
  // Note: IP-based rate limiting applied at middleware level
  app.post("/sign-in/email", signUpRateLimiter, async (c) => {
    if (!deps.betterAuthApi) {
      return c.json({ error: "Email/password authentication not configured" }, 503);
    }

    try {
      const body = (await c.req.json()) as {
        readonly email: string;
        readonly password: string;
      };

      // Validate required fields
      if (!body.email || typeof body.email !== "string") {
        return c.json({ error: "Email is required", field: "email" }, 400);
      }
      if (!body.password || typeof body.password !== "string") {
        return c.json({ error: "Password is required", field: "password" }, 400);
      }

      // Call Better Auth API
      const result = await deps.betterAuthApi.signInEmail({
        body: {
          email: body.email,
          password: body.password,
        },
        headers: c.req.raw.headers,
      });

      if (!result.token) {
        return c.json({ error: "Invalid credentials" }, 401);
      }

      // Return token and user info for CLI storage
      return c.json({
        token: result.token,
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          emailVerified: result.user.emailVerified,
        },
      });
    } catch (error) {
      // Handle authentication failures
      if (error instanceof Error) {
        const message = error.message.toLowerCase();
        if (
          message.includes("invalid") ||
          message.includes("credentials") ||
          message.includes("password")
        ) {
          return c.json({ error: "Invalid email or password" }, 401);
        }
        if (message.includes("email not verified")) {
          return c.json({ error: "Email not verified" }, 403);
        }
        if (message.includes("account banned") || message.includes("user banned")) {
          return c.json({ error: "Account has been suspended" }, 403);
        }
      }

      // Log unexpected errors for debugging
      console.error("Sign in error:", error);
      return c.json({ error: "Internal server error" }, 500);
    }
  });

  // OAuth callback handler - redirects to frontend after auth
  // Better Auth handles the actual callback, this is for custom post-auth logic
  app.get("/callback/:provider", async (c) => {
    // Better Auth will have already handled the OAuth flow
    // This endpoint can be used for custom post-authentication logic
    // such as redirecting to the frontend with tokens

    // Redirect to the frontend dashboard
    return c.redirect(`${baseUrl}/dashboard`);
  });

  // Mount Better Auth handlers at /auth/*
  // This handles all Better Auth endpoints:
  // - /auth/sign-in/social
  // - /auth/sign-in/social/callback
  // - /auth/session
  // - /auth/sign-out
  // - /auth/organization/*
  // Note: This must come last to not override our custom endpoints above
  app.all("/*", async (c) => {
    const response = await deps.betterAuthHandler(c.req.raw);
    return response;
  });

  return app;
};

/**
 * Create a simple auth callback handler for use with Better Auth
 *
 * This can be used to handle specific OAuth provider callbacks
 * if you need custom logic beyond what Better Auth provides.
 */
export const createOAuthCallbackHandler = (deps: {
  readonly onSuccess: (user: User, provider: string) => Promise<void>;
  readonly redirectUrl: string;
}) => {
  const app = new Hono();

  app.get("/:provider", async (_c) => {
    // Better Auth handles the actual OAuth exchange
    // This route is for any additional custom logic

    return _c.redirect(deps.redirectUrl);
  });

  return app;
};
