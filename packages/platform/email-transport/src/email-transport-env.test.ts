import { InvalidEnvValueError } from "@platform/env"
import { Cause, Effect, Exit } from "effect"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { emailTransportEnvConfig } from "./index.ts"

const ENV_KEYS = [
  "LAT_MAILGUN_API_KEY",
  "LAT_MAILGUN_DOMAIN",
  "LAT_MAILGUN_REGION",
  "LAT_MAILGUN_FROM",
  "LAT_SMTP_HOST",
  "LAT_SMTP_PORT",
  "LAT_SMTP_USER",
  "LAT_SMTP_PASS",
  "LAT_SMTP_FROM",
  "LAT_MAILPIT_HOST",
  "LAT_MAILPIT_PORT",
  "LAT_MAILPIT_FROM",
] as const

let snapshot: Record<string, string | undefined>

beforeEach(() => {
  snapshot = {}
  for (const key of ENV_KEYS) {
    snapshot[key] = process.env[key]
    delete process.env[key]
  }
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = snapshot[key]
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
})

describe("emailTransportEnvConfig", () => {
  it("resolves defaults when optional vars are unset", async () => {
    const exit = await Effect.runPromiseExit(emailTransportEnvConfig)
    expect(Exit.isSuccess(exit)).toBe(true)
    if (!Exit.isSuccess(exit)) return

    expect(exit.value.mailgun).toEqual({
      apiKey: undefined,
      domain: undefined,
      region: "us",
      from: undefined,
    })
    expect(exit.value.smtp).toEqual({
      host: undefined,
      port: 587,
      user: undefined,
      pass: undefined,
      from: undefined,
    })
    expect(exit.value.mailpit).toEqual({
      host: "localhost",
      port: 1025,
      from: "noreply@latitude.local",
    })
  })

  it("maps LAT_MAILGUN_REGION=eu to region eu", async () => {
    process.env.LAT_MAILGUN_REGION = "eu"
    const exit = await Effect.runPromiseExit(emailTransportEnvConfig)
    expect(Exit.isSuccess(exit)).toBe(true)
    if (!Exit.isSuccess(exit)) return
    expect(exit.value.mailgun.region).toBe("eu")
  })

  it("parses LAT_SMTP_PORT override", async () => {
    process.env.LAT_SMTP_PORT = "465"
    const exit = await Effect.runPromiseExit(emailTransportEnvConfig)
    expect(Exit.isSuccess(exit)).toBe(true)
    if (!Exit.isSuccess(exit)) return
    expect(exit.value.smtp.port).toBe(465)
  })

  it("fails on invalid LAT_SMTP_PORT", async () => {
    process.env.LAT_SMTP_PORT = "not-a-number"
    const exit = await Effect.runPromiseExit(emailTransportEnvConfig)
    expect(Exit.isFailure(exit)).toBe(true)
    if (!Exit.isFailure(exit)) return
    const errOpt = Cause.findErrorOption(exit.cause)
    expect(errOpt._tag).toBe("Some")
    if (errOpt._tag !== "Some") return
    expect(errOpt.value).toBeInstanceOf(InvalidEnvValueError)
    expect(errOpt.value.name).toBe("LAT_SMTP_PORT")
  })
})
