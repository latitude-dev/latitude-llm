import type { Context } from "hono"

/**
 * Effect utilities for API routes.
 *
 * These helpers standardize Effect handling in route handlers,
 * reducing boilerplate while maintaining type safety.
 */

/**
 * Extract a route parameter and validate it.
 *
 * @param c - Hono context
 * @param name - Parameter name
 * @param validator - Function to validate and transform the value
 * @returns Transformed value or null if invalid/missing
 *
 * Usage:
 * ```typescript
 * const organizationId = extractParam(c, "organizationId", OrganizationId);
 * if (!organizationId) throw new BadRequestError({ httpMessage: "Organization ID required" });
 * ```
 */
export const extractParam = <T>(c: Context, name: string, validator: (value: string) => T | null): T | null => {
  const value = c.req.param(name)
  if (!value) return null
  return validator(value)
}
