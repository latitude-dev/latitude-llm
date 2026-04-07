import { Data, Effect, Result } from "effect"

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

type ParseEnvFailure = MissingEnvValueError | InvalidEnvValueError

const parsePresentValue = (
  name: string,
  value: string,
  expectedType: EnvPrimitive,
): Result.Result<string | number | boolean, InvalidEnvValueError> => {
  if (expectedType === "string") {
    return Result.succeed(value)
  }

  if (expectedType === "number") {
    const parsed = Number(value)

    if (Number.isNaN(parsed)) {
      return Result.fail(new InvalidEnvValueError({ name, expectedType, value }))
    }

    return Result.succeed(parsed)
  }

  const normalized = value.toLowerCase()

  if (normalized === "true") {
    return Result.succeed(true)
  }

  if (normalized === "false") {
    return Result.succeed(false)
  }

  return Result.fail(new InvalidEnvValueError({ name, expectedType, value }))
}

const parseEnvRequiredRaw = (
  name: string,
  expectedType: EnvPrimitive,
  fallback: string | number | boolean | undefined,
): Result.Result<string | number | boolean, ParseEnvFailure> => {
  const raw = process.env[name]

  if (raw === undefined || raw.length === 0) {
    if (fallback !== undefined) {
      return Result.succeed(fallback)
    }
    return Result.fail(new MissingEnvValueError({ name, expectedType }))
  }

  return parsePresentValue(name, raw, expectedType)
}

const parseEnvOptionalRaw = (
  name: string,
  expectedType: EnvPrimitive,
): Result.Result<string | number | boolean | undefined, InvalidEnvValueError> => {
  const raw = process.env[name]

  if (raw === undefined || raw.length === 0) {
    return Result.succeed(undefined)
  }

  return parsePresentValue(name, raw, expectedType)
}

export function parseEnvSync(name: string, expectedType: "string", fallback?: string): string
export function parseEnvSync(name: string, expectedType: "number", fallback?: number): number
export function parseEnvSync(name: string, expectedType: "boolean", fallback?: boolean): boolean
export function parseEnvSync(
  name: string,
  expectedType: EnvPrimitive,
  fallback?: string | number | boolean,
): string | number | boolean {
  return Result.getOrThrow(parseEnvRequiredRaw(name, expectedType, fallback))
}

export function parseEnvOptionalSync(name: string, expectedType: "string"): string | undefined
export function parseEnvOptionalSync(name: string, expectedType: "number"): number | undefined
export function parseEnvOptionalSync(name: string, expectedType: "boolean"): boolean | undefined
export function parseEnvOptionalSync(name: string, expectedType: EnvPrimitive): string | number | boolean | undefined {
  return Result.getOrThrow(parseEnvOptionalRaw(name, expectedType))
}

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
): Effect.Effect<string | number | boolean, ParseEnvFailure> {
  return Effect.fromResult(parseEnvRequiredRaw(name, expectedType, fallback))
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
  return Effect.fromResult(parseEnvOptionalRaw(name, expectedType))
}
