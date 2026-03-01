import { Effect } from "effect";
import type { Context } from "hono";

/**
 * Effect utilities for API routes.
 *
 * These helpers standardize Effect handling in route handlers,
 * reducing boilerplate while maintaining type safety.
 */

/**
 * Run a use case Effect and return a standardized result.
 *
 * Usage:
 * ```typescript
 * const result = await runUseCase(createProjectUseCase(repo)(input));
 * if (!result.success) return mapErrorToResponse(c, result.error);
 * return c.json(result.data, 201);
 * ```
 */
export const runUseCase = async <T, E>(
  effect: Effect.Effect<T, E>,
): Promise<{ success: true; data: T } | { success: false; error: E }> => {
  return Effect.runPromise(
    Effect.match(effect, {
      onFailure: (error) => ({ success: false as const, error }),
      onSuccess: (data) => ({ success: true as const, data }),
    }),
  );
};

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
 * const organizationId = extractParam(c, "organizationId", organizationId);
 * if (!organizationId) return c.json({ error: "Workspace ID required" }, 400);
 * ```
 */
export const extractParam = <T>(
  c: Context,
  name: string,
  validator: (value: string) => T | null,
): T | null => {
  const value = c.req.param(name);
  if (!value) return null;
  return validator(value);
};

/**
 * Extract and validate body from request.
 *
 * @param c - Hono context
 * @param validator - Zod schema or validation function
 * @returns Parsed body or null if invalid
 */
export const extractBody = async <T>(
  c: Context,
  validator: (body: unknown) => T | null,
): Promise<T | null> => {
  try {
    const body = await c.req.json();
    return validator(body);
  } catch {
    return null;
  }
};
