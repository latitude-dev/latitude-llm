import { createBetterAuth } from "@platform/auth-better";
import { createRedisClient, createRedisConnection } from "@platform/cache-redis";
import { parseEnv, parseEnvOptional } from "@platform/env";
import type { User } from "better-auth";
import { Effect } from "effect";
import { Hono } from "hono";
import { getPostgresClient } from "../clients.js";
import { BadRequestError } from "../errors.js";
import {
  createMagicLinkEmailRateLimiter,
  createMagicLinkIpRateLimiter,
  createSignUpIpRateLimiter,
} from "../middleware/rate-limiter.js";

// Email adapters
import { magicLinkTemplate } from "@domain/email";
import { createMailpitEmailSender } from "@platform/email-mailpit";
import { createSendGridEmailSender } from "@platform/email-sendgrid";
import { createSmtpEmailSender } from "@platform/email-smtp";

/**
 * Create email sender based on environment configuration
 * Priority: SendGrid > SMTP > Mailpit (fallback)
 */
const createEmailSender = () => {
  // Try SendGrid first
  const sendgridApiKey = Effect.runSync(parseEnvOptional(process.env.SENDGRID_API_KEY, "string"));
  const sendgridFrom = Effect.runSync(parseEnvOptional(process.env.SENDGRID_FROM, "string"));

  if (sendgridApiKey && sendgridFrom) {
    return createSendGridEmailSender({
      apiKey: sendgridApiKey,
      from: sendgridFrom,
    });
  }

  // Try SMTP
  const smtpHost = Effect.runSync(parseEnvOptional(process.env.SMTP_HOST, "string"));
  const smtpPortStr = Effect.runSync(parseEnvOptional(process.env.SMTP_PORT, "string"));
  const smtpUser = Effect.runSync(parseEnvOptional(process.env.SMTP_USER, "string"));
  const smtpPass = Effect.runSync(parseEnvOptional(process.env.SMTP_PASS, "string"));
  const smtpFrom = Effect.runSync(parseEnvOptional(process.env.SMTP_FROM, "string"));

  if (smtpHost && smtpPortStr && smtpUser && smtpPass && smtpFrom) {
    return createSmtpEmailSender({
      host: smtpHost,
      port: Number.parseInt(smtpPortStr, 10),
      user: smtpUser,
      pass: smtpPass,
      from: smtpFrom,
    });
  }

  // Fall back to Mailpit for local development
  const mailpitHost =
    Effect.runSync(parseEnvOptional(process.env.MAILPIT_HOST, "string")) ?? "localhost";
  const mailpitPortStr =
    Effect.runSync(parseEnvOptional(process.env.MAILPIT_PORT, "string")) ?? "1025";
  const mailpitFrom =
    Effect.runSync(parseEnvOptional(process.env.MAILPIT_FROM, "string")) ??
    "noreply@latitude.local";

  return createMailpitEmailSender({
    host: mailpitHost,
    port: Number.parseInt(mailpitPortStr, 10),
    from: mailpitFrom,
  });
};

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
  const baseUrl = "http://localhost:3000";

  // Initialize dependencies where they are used
  const { db } = getPostgresClient();
  const redisConn = createRedisConnection();
  const redis = createRedisClient(redisConn);

  const betterAuthSecret = Effect.runSync(parseEnv(process.env.BETTER_AUTH_SECRET, "string"));

  // Create email sender
  const emailSender = createEmailSender();

  const auth = createBetterAuth({
    db,
    secret: betterAuthSecret,
    // Magic Link email configuration
    sendMagicLink: async ({ email, url }) => {
      const userName = email.split("@")[0];
      const html = magicLinkTemplate({ userName, magicLinkUrl: url });

      await Effect.runPromise(
        emailSender.send({
          to: email,
          subject: "Log in to Latitude",
          html,
        }),
      );
    },
    // User creation hook for auto-onboarding
    onUserCreated: async (user) => {
      // Publish UserCreated event to trigger workspace creation
      // This would integrate with the events queue/worker
      console.log("User created, triggering onboarding:", {
        userId: user.id,
        email: user.email,
      });
    },
  });

  const betterAuthHandler = auth.handler;
  const betterAuthApi = auth.api as unknown as BetterAuthAPI;

  // Create rate limiters with Redis
  const signUpRateLimiter = createSignUpIpRateLimiter(redis);
  const magicLinkIpRateLimiter = createMagicLinkIpRateLimiter(redis);
  const magicLinkEmailRateLimiter = createMagicLinkEmailRateLimiter(redis);

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

    // Redirect to the frontend dashboard
    return c.redirect(`${baseUrl}/dashboard`);
  });

  // Magic Link endpoint with rate limiting
  // Better Auth handles this at /sign-in/magic-link, but we add rate limiting
  app.post("/sign-in/magic-link", magicLinkIpRateLimiter, magicLinkEmailRateLimiter, async (c) => {
    // Let Better Auth handle the actual request
    const response = await betterAuthHandler(c.req.raw);
    return response;
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
    const response = await betterAuthHandler(c.req.raw);
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
