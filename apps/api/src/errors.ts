import { Data } from "effect";

/**
 * Interface for errors that can be returned in an HTTP context.
 *
 * Domain errors that need specific HTTP handling should implement this interface
 * to bundle their HTTP status code and message.
 */
export interface HttpError {
  readonly _tag: string;
  readonly httpStatus: number;
  readonly httpMessage: string;
}

// Common HTTP error types that can be reused across domains

export class BadRequestError extends Data.TaggedError("BadRequestError")<{
  readonly httpMessage: string;
  readonly field?: string;
}> {
  readonly httpStatus = 400;
}

export class UnauthorizedError extends Data.TaggedError("UnauthorizedError")<{
  readonly httpMessage: string;
}> {
  readonly httpStatus = 401;
}

export class ForbiddenError extends Data.TaggedError("ForbiddenError")<{
  readonly httpMessage: string;
}> {
  readonly httpStatus = 403;
}

export class NotFoundHttpError extends Data.TaggedError("NotFoundHttpError")<{
  readonly httpMessage: string;
}> {
  readonly httpStatus = 404;
}

export class ConflictHttpError extends Data.TaggedError("ConflictHttpError")<{
  readonly httpMessage: string;
}> {
  readonly httpStatus = 409;
}

// Type guard to check if an error has HTTP properties
export const isHttpError = (error: unknown): error is HttpError => {
  return (
    typeof error === "object" &&
    error !== null &&
    "httpStatus" in error &&
    typeof error.httpStatus === "number" &&
    "httpMessage" in error &&
    typeof error.httpMessage === "string"
  );
};

// Helper to convert domain errors to HTTP responses
export const toHttpResponse = (
  error: unknown,
): { status: number; body: Record<string, unknown> } => {
  if (isHttpError(error)) {
    return {
      status: error.httpStatus,
      body: { error: error.httpMessage },
    };
  }

  // Default to 500 for unknown errors
  return {
    status: 500,
    body: { error: "Internal server error" },
  };
};
