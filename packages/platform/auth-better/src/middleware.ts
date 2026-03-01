import type { Session, User } from "better-auth";
import type { Context, Next } from "hono";

/**
 * Hono middleware for Better Auth session validation.
 *
 * This middleware:
 * 1. Extracts session token from cookies/headers
 * 2. Validates session with Better Auth
 * 3. Attaches user and session to Hono context
 * 4. Handles 401 for invalid/missing sessions
 */

// Extend Hono context type
declare module "hono" {
  interface ContextVariableMap {
    user: User | null;
    session: Session | null;
  }
}

export interface AuthMiddlewareConfig {
  /**
   * Function to validate session from request.
   * Returns { user, session } or null if invalid.
   */
  validateSession: (token: string) => Promise<{ user: User; session: Session } | null>;
}

/**
 * Extract bearer token from Authorization header.
 * Format: "Bearer <token>"
 */
const extractBearerToken = (authHeader: string | undefined): string | null => {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.slice(7); // Remove "Bearer " prefix
};

/**
 * Create Hono middleware for session validation.
 */
export const createAuthMiddleware = (config: AuthMiddlewareConfig) => {
  return async (c: Context, next: Next) => {
    // Try to get token from Authorization header
    const authHeader = c.req.header("Authorization");
    const token = extractBearerToken(authHeader);

    if (!token) {
      c.set("user", null);
      c.set("session", null);
      await next();
      return;
    }

    // Validate session
    const result = await config.validateSession(token);

    if (!result) {
      c.set("user", null);
      c.set("session", null);
      await next();
      return;
    }

    // Attach user and session to context
    c.set("user", result.user);
    c.set("session", result.session);

    await next();
  };
};

/**
 * Middleware that requires authentication.
 * Returns 401 if no valid session.
 */
export const requireAuth = async (c: Context, next: Next) => {
  const user = c.get("user");

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  await next();
};

/**
 * Middleware that requires organization membership.
 * Must be used after auth middleware.
 */
export interface RequireOrganizationConfig {
  getOrganizationId: (c: Context) => string | null;
  checkMembership: (userId: string, organizationId: string) => Promise<boolean>;
}

export const createRequireOrganizationMiddleware = (config: RequireOrganizationConfig) => {
  return async (c: Context, next: Next) => {
    const user = c.get("user");

    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const organizationId = config.getOrganizationId(c);

    if (!organizationId) {
      return c.json({ error: "Organization ID required" }, 400);
    }

    const hasAccess = await config.checkMembership(user.id, organizationId);

    if (!hasAccess) {
      return c.json({ error: "Forbidden" }, 403);
    }

    await next();
  };
};
