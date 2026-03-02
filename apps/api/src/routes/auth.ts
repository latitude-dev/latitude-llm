import { createBetterAuth } from "@platform/auth-better";
import { createRedisClient, createRedisConnection } from "@platform/cache-redis";
import { createUserPostgresRepository } from "@platform/db-postgres";
import { parseEnv } from "@platform/env";
import type { User } from "better-auth";
import { Effect } from "effect";
import { Hono } from "hono";
import { getPostgresClient } from "../clients.js";
import { BadRequestError } from "../errors.js";
import { createSignUpIpRateLimiter } from "../middleware/rate-limiter.js";

// Email template
import { magicLinkTemplate, sendEmail } from "@domain/email";
import { createNodemailerEmailSender } from "@platform/email-nodemailer";

/**
 * Auth routes for Better Auth
 *
 * Mounts Better Auth handlers and provides JWT-specific endpoints.
 *
 * Better Auth provides the following endpoints:
 * - POST /auth/sign-in/social - Initiate OAuth sign in
 * - POST /auth/sign-in/social/callback - OAuth callback
 * - GET /auth/session - Get current session
 * - POST /auth/sign-out - Sign out
 * - POST /auth/organization/create - Create organization (organization)
 * - POST /auth/organization/invite-member - Invite member to organization
 * - GET /auth/organization/list - List user's organizations
 *
 * JWT-specific endpoints added:
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

/**
 * Create auth routes for Better Auth
 *
 * This mounts the Better Auth handlers at /auth/* and adds JWT-specific endpoints.
 */
export const createAuthRoutes = () => {
  const app = new Hono();

  // Get URLs from environment variables
  const baseUrl = Effect.runSync(parseEnv(process.env.BETTER_AUTH_URL, "string"));
  const webUrl = Effect.runSync(parseEnv(process.env.WEB_URL, "string"));

  // Initialize dependencies where they are used
  const { db } = getPostgresClient();
  const redisConn = createRedisConnection();
  const redis = createRedisClient(redisConn);

  const betterAuthSecret = Effect.runSync(parseEnv(process.env.BETTER_AUTH_SECRET, "string"));

  // Create email sender adapter
  const emailSender = createNodemailerEmailSender();
  const sendEmailUseCase = sendEmail({ emailSender });

  // Create user repository
  const userRepository = createUserPostgresRepository(db);

  const auth = createBetterAuth({
    db,
    secret: betterAuthSecret,
    baseUrl,
    // Allow web app origin for magic link callbacks
    trustedOrigins: [webUrl],
    // Magic Link email configuration
    sendMagicLink: async ({ email, url }: { email: string; url: string; token: string }) => {
      // Find user by email using the repository
      const user = await Effect.runPromise(userRepository.findByEmail(email));
      const userName = user?.name ?? email.split("@")[0];
      const html = await magicLinkTemplate({ userName, magicLinkUrl: url });

      await Effect.runPromise(
        sendEmailUseCase({
          to: email,
          subject: "Log in to Latitude",
          html,
        }),
      );
    },
    // User creation hook for auto-onboarding
    onUserCreated: async (_user) => {
      // Publish UserCreated event to trigger workspace creation
      // This would integrate with the events queue/worker
    },
  });

  const betterAuthHandler = auth.handler;
  const betterAuthApi = auth.api as unknown as BetterAuthAPI;

  // Create rate limiters with Redis
  const signUpRateLimiter = createSignUpIpRateLimiter(redis);

  // JWT-specific: POST /auth/sign-up/email - Email/password sign up
  // Returns JSON instead of redirect (for JWT tools)
  app.post("/sign-up/email", signUpRateLimiter, async (c) => {
    const body = (await c.req.json()) as {
      readonly email: string;
      readonly password: string;
      readonly name: string;
    };

    // Validate required fields
    if (!body.email || typeof body.email !== "string") {
      throw new BadRequestError({ httpMessage: "Email is required", field: "email" });
    }
    if (!body.password || typeof body.password !== "string") {
      throw new BadRequestError({ httpMessage: "Password is required", field: "password" });
    }
    if (!body.name || typeof body.name !== "string") {
      throw new BadRequestError({ httpMessage: "Name is required", field: "name" });
    }

    // Validate password length
    if (body.password.length < 8) {
      throw new BadRequestError({
        httpMessage: "Password must be at least 8 characters",
        field: "password",
      });
    }
    if (body.password.length > 128) {
      throw new BadRequestError({
        httpMessage: "Password must not exceed 128 characters",
        field: "password",
      });
    }

    // Call Better Auth API - let errors propagate to middleware
    const result = await betterAuthApi.signUpEmail({
      body: {
        email: body.email,
        password: body.password,
        name: body.name,
      },
      headers: c.req.raw.headers,
    });

    if (!result.token) {
      throw new Error("Failed to create account");
    }

    // Return token and user info for JWT storage
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
  });

  // JWT-specific: POST /auth/sign-in/email - Email/password sign in
  // Returns JSON instead of redirect/cookies (for JWT tools)
  // Note: IP-based rate limiting applied at middleware level
  app.post("/sign-in/email", signUpRateLimiter, async (c) => {
    const body = (await c.req.json()) as {
      readonly email: string;
      readonly password: string;
    };

    // Validate required fields
    if (!body.email || typeof body.email !== "string") {
      throw new BadRequestError({ httpMessage: "Email is required", field: "email" });
    }
    if (!body.password || typeof body.password !== "string") {
      throw new BadRequestError({ httpMessage: "Password is required", field: "password" });
    }

    // Call Better Auth API - let errors propagate to middleware
    const result = await betterAuthApi.signInEmail({
      body: {
        email: body.email,
        password: body.password,
      },
      headers: c.req.raw.headers,
    });

    if (!result.token) {
      throw new BadRequestError({ httpMessage: "Invalid credentials" });
    }

    // Return token and user info for JWT storage
    return c.json({
      token: result.token,
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        emailVerified: result.user.emailVerified,
      },
    });
  });

  // OAuth callback handler - redirects to frontend after auth
  // Better Auth handles the actual callback, this is for custom post-auth logic
  app.get("/callback/:provider", async (c) => {
    // Better Auth will have already handled the OAuth flow
    // This endpoint can be used for custom post-authentication logic
    // such as redirecting to the frontend with tokens

    // Redirect to the frontend root
    return c.redirect(webUrl);
  });

  // Mount Better Auth handlers at /auth/*
  // This handles all Better Auth endpoints:
  // - /auth/sign-in/social
  // - /auth/sign-in/social/callback
  // - /auth/sign-in/magic-link
  // - /auth/session
  // - /auth/sign-out
  // - /auth/organization/*
  // Note: This must come last to not override our custom endpoints above
  app.all("/*", async (c) => betterAuthHandler(c.req.raw));

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
