import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { loadConfig } from "./config.ts"

describe("loadConfig", () => {
  it("reads credentials from pluginConfig", () => {
    const config = loadConfig({ apiKey: "k", project: "p" })
    expect(config.apiKey).toBe("k")
    expect(config.project).toBe("p")
    expect(config.enabled).toBe(true)
  })

  it("defaults baseUrl to production ingest", () => {
    const config = loadConfig({ apiKey: "k", project: "p" })
    expect(config.baseUrl).toBe("https://ingest.latitude.so")
  })

  it("respects baseUrl override from pluginConfig", () => {
    const config = loadConfig({ apiKey: "k", project: "p", baseUrl: "https://staging-ingest.latitude.so" })
    expect(config.baseUrl).toBe("https://staging-ingest.latitude.so")
  })

  it("defaults allowConversationAccess to false (privacy-preserving default)", () => {
    const config = loadConfig({ apiKey: "k", project: "p" })
    expect(config.allowConversationAccess).toBe(false)
  })

  it("honors allowConversationAccess: true from pluginConfig", () => {
    const config = loadConfig({ apiKey: "k", project: "p", allowConversationAccess: true })
    expect(config.allowConversationAccess).toBe(true)
  })

  it("disables when explicit pluginConfig.enabled = false even with creds", () => {
    const config = loadConfig({ apiKey: "k", project: "p", enabled: false })
    expect(config.enabled).toBe(false)
  })

  it("disables when creds are missing", () => {
    const config = loadConfig({})
    expect(config.enabled).toBe(false)
    expect(config.apiKey).toBe("")
    expect(config.project).toBe("")
  })

  it("disables when pluginConfig is undefined entirely", () => {
    const config = loadConfig()
    expect(config.enabled).toBe(false)
  })

  it("ignores non-string apiKey (defensive against malformed openclaw.json)", () => {
    const config = loadConfig({ apiKey: 123 as unknown as string, project: "p" })
    expect(config.apiKey).toBe("")
    expect(config.enabled).toBe(false)
  })

  it("debug defaults to false; honors pluginConfig.debug", () => {
    expect(loadConfig({ apiKey: "k", project: "p" }).debug).toBe(false)
    expect(loadConfig({ apiKey: "k", project: "p", debug: true }).debug).toBe(true)
  })

  // Regression guard against the OpenClaw 2026.4.25 `env-harvesting` security
  // rule: any source containing both `process.env` and a network-send call
  // (we have `fetch(` in postTraces) is flagged as potential credential
  // exfiltration. The runtime bundle MUST contain zero `process.env` reads.
  it("contains no process.env references in the source (env-harvesting scan guard)", () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const sources = ["config.ts", "plugin.ts", "span-builder.ts", "client.ts", "otlp.ts", "messages.ts", "logger.ts"]
    for (const file of sources) {
      const content = readFileSync(join(here, file), "utf-8")
      expect(content, `${file} must not contain process.env (env-harvesting scan rule)`).not.toMatch(/process\.env/)
    }
  })
})
