import { describe, expect, it } from "vitest"
import { loadConfig } from "./config.ts"

describe("loadConfig", () => {
  it("prefers pluginConfig over env vars", () => {
    const config = loadConfig({ apiKey: "from-plugin-config", project: "p" }, {
      LATITUDE_API_KEY: "from-env",
      LATITUDE_PROJECT: "p-env",
    } as NodeJS.ProcessEnv)
    expect(config.apiKey).toBe("from-plugin-config")
    expect(config.project).toBe("p")
  })

  it("falls back to env vars when pluginConfig is empty", () => {
    const config = loadConfig({}, { LATITUDE_API_KEY: "k", LATITUDE_PROJECT: "p" } as NodeJS.ProcessEnv)
    expect(config.apiKey).toBe("k")
    expect(config.project).toBe("p")
    expect(config.enabled).toBe(true)
  })

  it("falls back to env vars when pluginConfig is undefined (no plugin entry yet)", () => {
    const config = loadConfig(undefined, {
      LATITUDE_API_KEY: "k",
      LATITUDE_PROJECT: "p",
    } as NodeJS.ProcessEnv)
    expect(config.apiKey).toBe("k")
    expect(config.project).toBe("p")
  })

  it("defaults baseUrl to production ingest", () => {
    const config = loadConfig({ apiKey: "k", project: "p" }, {} as NodeJS.ProcessEnv)
    expect(config.baseUrl).toBe("https://ingest.latitude.so")
  })

  it("respects baseUrl override from pluginConfig", () => {
    const config = loadConfig(
      { apiKey: "k", project: "p", baseUrl: "https://staging-ingest.latitude.so" },
      {} as NodeJS.ProcessEnv,
    )
    expect(config.baseUrl).toBe("https://staging-ingest.latitude.so")
  })

  it("defaults allowConversationAccess to false (privacy-preserving default)", () => {
    const config = loadConfig({ apiKey: "k", project: "p" }, {} as NodeJS.ProcessEnv)
    expect(config.allowConversationAccess).toBe(false)
  })

  it("honors allowConversationAccess: true from pluginConfig", () => {
    const config = loadConfig({ apiKey: "k", project: "p", allowConversationAccess: true }, {} as NodeJS.ProcessEnv)
    expect(config.allowConversationAccess).toBe(true)
  })

  it("disables when explicit pluginConfig.enabled = false even with creds", () => {
    const config = loadConfig({ apiKey: "k", project: "p", enabled: false }, {} as NodeJS.ProcessEnv)
    expect(config.enabled).toBe(false)
  })

  it("disables when LATITUDE_OPENCLAW_ENABLED=0", () => {
    const config = loadConfig({ apiKey: "k", project: "p" }, { LATITUDE_OPENCLAW_ENABLED: "0" } as NodeJS.ProcessEnv)
    expect(config.enabled).toBe(false)
  })

  it("disables when creds are missing", () => {
    const config = loadConfig({}, {} as NodeJS.ProcessEnv)
    expect(config.enabled).toBe(false)
    expect(config.apiKey).toBe("")
    expect(config.project).toBe("")
  })

  it("turns debug on via LATITUDE_DEBUG=1 even when pluginConfig doesn't set it", () => {
    const config = loadConfig({ apiKey: "k", project: "p" }, { LATITUDE_DEBUG: "1" } as NodeJS.ProcessEnv)
    expect(config.debug).toBe(true)
  })

  it("ignores non-string apiKey in pluginConfig (defensive against malformed config.json)", () => {
    const config = loadConfig({ apiKey: 123 as unknown as string, project: "p" }, {} as NodeJS.ProcessEnv)
    // Falls back through env (empty) → empty string → disabled.
    expect(config.apiKey).toBe("")
    expect(config.enabled).toBe(false)
  })
})
