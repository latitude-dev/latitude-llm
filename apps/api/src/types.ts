import type { OrganizationId, UserId } from "@domain/shared-kernel"
import type { Context } from "hono"

/**
 * Authentication context set by the auth middleware.
 *
 * This context is available on all protected routes after successful
 * authentication. It provides the authenticated user's ID, the
 * organization context for the request, and the authentication method used.
 */
export interface AuthContext {
  /** The authenticated user's ID */
  readonly userId: UserId
  /** The organization ID for this request (from URL param or API key) */
  readonly organizationId: OrganizationId
  /** The authentication method that was used */
  readonly method: "cookie" | "jwt" | "api-key"
}

/**
 * Type definition for Hono context variables.
 *
 * Extend this interface to add custom variables to Hono's context.
 * This enables type-safe access via `c.get('auth')`.
 */
export interface HonoVariables {
  auth: AuthContext
}

/**
 * Type alias for Hono Context with our custom variables.
 *
 * Use this type for route handlers to get type-safe access to auth context:
 *
 * ```typescript
 * app.get("/", (c: AuthenticatedContext) => {
 *   const auth = c.get("auth")
 *   // auth.userId and auth.organizationId are fully typed
 * })
 * ```
 */
export type AuthenticatedContext = Context<{ Variables: HonoVariables }>

/**
 * Hono module augmentation for type-safe context variables.
 *
 * This augments Hono's ContextVariableMap to include our custom 'auth'
 * variable, enabling type-safe access without casting.
 *
 * @see https://hono.dev/docs/guides/middleware#context-variables
 */
declare module "hono" {
  interface ContextVariableMap {
    auth?: AuthContext
  }
}
