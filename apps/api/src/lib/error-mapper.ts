import {
  ConflictError,
  NotFoundError,
  PermissionError,
  UnauthorizedError,
  ValidationError,
} from "@domain/shared-kernel";
import type { Context } from "hono";

/**
 * Error mapper for domain errors to HTTP responses.
 *
 * Provides consistent error handling across all API routes.
 */

/**
 * Map a domain error to an HTTP response.
 *
 * Usage:
 * ```typescript
 * const result = await runUseCase(useCase(input));
 * if (!result.success) return mapErrorToResponse(c, result.error);
 * return c.json(result.data, 200);
 * ```
 */
export const mapErrorToResponse = (c: Context, error: unknown): Response => {
  // Handle specific domain error types
  if (error instanceof NotFoundError) {
    return c.json({ error: error.message || "Resource not found" }, 404);
  }

  if (error instanceof ValidationError) {
    return c.json({ error: error.message || "Validation failed" }, 400);
  }

  if (error instanceof UnauthorizedError) {
    return c.json({ error: error.message || "Unauthorized" }, 401);
  }

  if (error instanceof PermissionError) {
    return c.json({ error: error.message || "Forbidden" }, 403);
  }

  if (error instanceof ConflictError) {
    return c.json({ error: error.message || "Conflict" }, 409);
  }

  // Repository errors
  if (error && typeof error === "object" && "_tag" in error) {
    const taggedError = error as { _tag: string; message?: string };
    if (taggedError._tag === "RepositoryError") {
      return c.json({ error: "Database error" }, 500);
    }
  }

  // Fallback for unknown errors
  console.error("Unhandled error:", error);
  return c.json({ error: "Internal server error" }, 500);
};

/**
 * Type guard to check if error is a domain error.
 */
export const isDomainError = (error: unknown): boolean => {
  return (
    error instanceof NotFoundError ||
    error instanceof ValidationError ||
    error instanceof UnauthorizedError ||
    error instanceof PermissionError ||
    error instanceof ConflictError
  );
};
