import { Data, Effect } from "effect";

export class MissingEnvValueError extends Data.TaggedError("MissingEnvValueError")<{
  readonly expectedType: "string" | "number" | "boolean";
}> {}

export class InvalidEnvValueError extends Data.TaggedError("InvalidEnvValueError")<{
  readonly expectedType: "string" | "number" | "boolean";
  readonly value: string;
}> {}

type EnvPrimitive = "string" | "number" | "boolean";

export function parseEnv(
  value: string | undefined,
  expectedType: "string",
  fallback?: string,
): Effect.Effect<string, MissingEnvValueError | InvalidEnvValueError>;
export function parseEnv(
  value: string | undefined,
  expectedType: "number",
  fallback?: number,
): Effect.Effect<number, MissingEnvValueError | InvalidEnvValueError>;
export function parseEnv(
  value: string | undefined,
  expectedType: "boolean",
  fallback?: boolean,
): Effect.Effect<boolean, MissingEnvValueError | InvalidEnvValueError>;
export function parseEnv(
  value: string | undefined,
  expectedType: EnvPrimitive,
  fallback?: string | number | boolean,
): Effect.Effect<string | number | boolean, MissingEnvValueError | InvalidEnvValueError> {
  if (value === undefined || value.length === 0) {
    if (fallback !== undefined) {
      return Effect.succeed(fallback);
    }

    return Effect.fail(new MissingEnvValueError({ expectedType }));
  }

  if (expectedType === "string") {
    return Effect.succeed(value);
  }

  if (expectedType === "number") {
    const parsed = Number(value);

    if (Number.isNaN(parsed)) {
      return Effect.fail(new InvalidEnvValueError({ expectedType, value }));
    }

    return Effect.succeed(parsed);
  }

  const normalized = value.toLowerCase();

  if (normalized === "true") {
    return Effect.succeed(true);
  }

  if (normalized === "false") {
    return Effect.succeed(false);
  }

  return Effect.fail(new InvalidEnvValueError({ expectedType, value }));
}

export function parseEnvOptional(
  value: string | undefined,
  expectedType: "string",
): Effect.Effect<string | undefined, InvalidEnvValueError>;
export function parseEnvOptional(
  value: string | undefined,
  expectedType: "number",
): Effect.Effect<number | undefined, InvalidEnvValueError>;
export function parseEnvOptional(
  value: string | undefined,
  expectedType: "boolean",
): Effect.Effect<boolean | undefined, InvalidEnvValueError>;
export function parseEnvOptional(
  value: string | undefined,
  expectedType: EnvPrimitive,
): Effect.Effect<string | number | boolean | undefined, InvalidEnvValueError> {
  if (value === undefined || value.length === 0) {
    return Effect.succeed(undefined as undefined);
  }

  if (expectedType === "string") {
    return Effect.succeed(value);
  }

  if (expectedType === "number") {
    const parsed = Number(value);

    if (Number.isNaN(parsed)) {
      return Effect.fail(new InvalidEnvValueError({ expectedType, value }));
    }

    return Effect.succeed(parsed);
  }

  const normalized = value.toLowerCase();

  if (normalized === "true") {
    return Effect.succeed(true);
  }

  if (normalized === "false") {
    return Effect.succeed(false);
  }

  return Effect.fail(new InvalidEnvValueError({ expectedType, value }));
}
