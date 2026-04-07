import { Effect } from "effect"
import { afterEach, describe, expect, it } from "vitest"
import {
  InvalidEnvValueError,
  MissingEnvValueError,
  parseEnv,
  parseEnvOptional,
  parseEnvOptionalSync,
  parseEnvSync,
} from "./index.ts"

describe("parseEnvSync / parseEnvOptionalSync", () => {
  const snapshot = { ...process.env }

  afterEach(() => {
    process.env = { ...snapshot }
  })

  it("matches parseEnv for required string", () => {
    process.env.MY_SYNC_STR = "hello"
    expect(parseEnvSync("MY_SYNC_STR", "string")).toBe("hello")
    expect(Effect.runSync(parseEnv("MY_SYNC_STR", "string"))).toBe("hello")
  })

  it("matches parseEnvOptional for optional number", () => {
    process.env.MY_SYNC_NUM = "42"
    expect(parseEnvOptionalSync("MY_SYNC_NUM", "number")).toBe(42)
    expect(Effect.runSync(parseEnvOptional("MY_SYNC_NUM", "number"))).toBe(42)
  })

  it("throws MissingEnvValueError like parseEnv would fail", () => {
    delete process.env.MY_MISSING_SYNC
    expect(() => parseEnvSync("MY_MISSING_SYNC", "string")).toThrow(MissingEnvValueError)
  })

  it("throws InvalidEnvValueError for bad boolean", () => {
    process.env.MY_BAD_BOOL = "maybe"
    expect(() => parseEnvSync("MY_BAD_BOOL", "boolean")).toThrow(InvalidEnvValueError)
  })
})
