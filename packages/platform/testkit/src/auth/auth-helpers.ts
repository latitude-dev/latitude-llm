import type { Effect as EffectType } from "effect"

/**
 * Auth context for testing authenticated requests
 */
export interface TestAuthContext {
  readonly userId: string
  readonly organizationId: string
  readonly apiKeyToken?: string
  readonly sessionToken?: string
}

/**
 * Generate headers for API key authentication
 */
export const createApiKeyAuthHeaders = (apiKeyToken: string): Record<string, string> => {
  return {
    Authorization: `Bearer ${apiKeyToken}`,
  }
}

/**
 * Generate headers for Bearer token (JWT) authentication
 */
export const createBearerAuthHeaders = (sessionToken: string): Record<string, string> => {
  return {
    Authorization: `Bearer ${sessionToken}`,
  }
}

/**
 * Generate auth headers from test context
 */
export const createAuthHeaders = (context: TestAuthContext): Record<string, string> => {
  if (context.apiKeyToken) {
    return createApiKeyAuthHeaders(context.apiKeyToken)
  }
  if (context.sessionToken) {
    return createBearerAuthHeaders(context.sessionToken)
  }
  return {}
}

/**
 * Create a mock JWT token for testing (not cryptographically valid, but parseable)
 *
 * This creates a token that looks like a JWT for testing purposes.
 * For actual integration tests with Better Auth, you should use
 * real sessions created through the auth flow.
 */
export const createMockJwtToken = (payload: Record<string, unknown>): string => {
  const header = { alg: "HS256", typ: "JWT" }
  const base64Header = Buffer.from(JSON.stringify(header)).toString("base64url")
  const base64Payload = Buffer.from(JSON.stringify(payload)).toString("base64url")
  const signature = "mock-signature" // Not a real signature
  return `${base64Header}.${base64Payload}.${signature}`
}

/**
 * Create a test session context with mock JWT
 *
 * Note: This creates a mock token that won't pass real validation.
 * Use this for testing middleware behavior, not for full auth integration tests.
 */
export const createMockSessionContext = (userId: string, organizationId?: string): TestAuthContext => {
  const payload: Record<string, unknown> = {
    sub: userId,
    iat: Date.now(),
  }

  if (organizationId) {
    payload.organizationId = organizationId
  }

  return {
    userId,
    organizationId: organizationId ?? "",
    sessionToken: createMockJwtToken(payload),
  }
}

/**
 * Wrap an Effect with a test auth context
 *
 * This is useful for testing services that depend on auth context
 * without going through the full HTTP layer.
 */
export const withAuthContext = <A, E>(
  effect: EffectType.Effect<A, E>,
  _context: TestAuthContext,
): EffectType.Effect<A, E> => {
  // In a real implementation, this might set context in a fiber ref
  // For now, just return the effect as-is since we're testing at the HTTP layer
  return effect
}
