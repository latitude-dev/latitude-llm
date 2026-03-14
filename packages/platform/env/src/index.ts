import { Data, Effect } from "effect"

export class MissingEnvValueError extends Data.TaggedError("MissingEnvValueError")<{
  readonly name: string
  readonly expectedType: "string" | "number" | "boolean"
}> {
  override get message() {
    return `Missing required environment variable: ${this.name} (expected ${this.expectedType})`
  }
  override get stack() {
    return this.message
  }
}

export class InvalidEnvValueError extends Data.TaggedError("InvalidEnvValueError")<{
  readonly name: string
  readonly expectedType: "string" | "number" | "boolean"
  readonly value: string
}> {
  override get message() {
    return `Invalid environment variable: ${this.name}=${this.value} (expected ${this.expectedType})`
  }
  override get stack() {
    return this.message
  }
}

type EnvPrimitive = "string" | "number" | "boolean"

export function parseEnv(
  name: string,
  expectedType: "string",
  fallback?: string,
): Effect.Effect<string, MissingEnvValueError | InvalidEnvValueError>
export function parseEnv(
  name: string,
  expectedType: "number",
  fallback?: number,
): Effect.Effect<number, MissingEnvValueError | InvalidEnvValueError>
export function parseEnv(
  name: string,
  expectedType: "boolean",
  fallback?: boolean,
): Effect.Effect<boolean, MissingEnvValueError | InvalidEnvValueError>
export function parseEnv(
  name: string,
  expectedType: EnvPrimitive,
  fallback?: string | number | boolean,
): Effect.Effect<string | number | boolean, MissingEnvValueError | InvalidEnvValueError> {
  const value = process.env[name]

  if (value === undefined || value.length === 0) {
    if (fallback !== undefined) {
      return Effect.succeed(fallback)
    }

    return Effect.fail(new MissingEnvValueError({ name, expectedType }))
  }

  if (expectedType === "string") {
    return Effect.succeed(value)
  }

  if (expectedType === "number") {
    const parsed = Number(value)

    if (Number.isNaN(parsed)) {
      return Effect.fail(new InvalidEnvValueError({ name, expectedType, value }))
    }

    return Effect.succeed(parsed)
  }

  const normalized = value.toLowerCase()

  if (normalized === "true") {
    return Effect.succeed(true)
  }

  if (normalized === "false") {
    return Effect.succeed(false)
  }

  return Effect.fail(new InvalidEnvValueError({ name, expectedType, value }))
}

export function parseEnvOptional(
  name: string,
  expectedType: "string",
): Effect.Effect<string | undefined, InvalidEnvValueError>
export function parseEnvOptional(
  name: string,
  expectedType: "number",
): Effect.Effect<number | undefined, InvalidEnvValueError>
export function parseEnvOptional(
  name: string,
  expectedType: "boolean",
): Effect.Effect<boolean | undefined, InvalidEnvValueError>
export function parseEnvOptional(
  name: string,
  expectedType: EnvPrimitive,
): Effect.Effect<string | number | boolean | undefined, InvalidEnvValueError> {
  const value = process.env[name]

  if (value === undefined || value.length === 0) {
    return Effect.succeed(undefined)
  }

  if (expectedType === "string") {
    return Effect.succeed(value)
  }

  if (expectedType === "number") {
    const parsed = Number(value)

    if (Number.isNaN(parsed)) {
      return Effect.fail(new InvalidEnvValueError({ name, expectedType, value }))
    }

    return Effect.succeed(parsed)
  }

  const normalized = value.toLowerCase()

  if (normalized === "true") {
    return Effect.succeed(true)
  }

  if (normalized === "false") {
    return Effect.succeed(false)
  }

  return Effect.fail(new InvalidEnvValueError({ name, expectedType, value }))
}
