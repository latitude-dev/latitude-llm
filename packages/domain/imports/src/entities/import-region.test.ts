import { describe, expect, it } from "vitest"
import {
  BRAINTRUST_REGION_DEFINITIONS,
  IMPORT_SOURCE_REGION_OPTIONS,
  isKnownImportBaseUrl,
  LANGFUSE_REGION_DEFINITIONS,
  LANGSMITH_REGION_DEFINITIONS,
} from "./import-region.ts"
import { IMPORT_SOURCES, importSourceBaseUrl } from "./import-source.ts"

const ALL_DEFINITIONS = [LANGFUSE_REGION_DEFINITIONS, LANGSMITH_REGION_DEFINITIONS, BRAINTRUST_REGION_DEFINITIONS]

describe("import regions", () => {
  // Pinned against each vendor's own docs. A wrong origin authenticates against the wrong
  // deployment and reads an empty project, which looks like a successful empty import.
  it.each([
    ["eu", "https://cloud.langfuse.com"],
    ["us", "https://us.cloud.langfuse.com"],
    ["jp", "https://jp.cloud.langfuse.com"],
    ["hipaa-us", "https://hipaa.cloud.langfuse.com"],
  ] as const)("maps Langfuse %s to %s", (region, baseUrl) => {
    expect(LANGFUSE_REGION_DEFINITIONS[region].baseUrl).toBe(baseUrl)
  })

  it.each([
    ["gcp-us", "https://api.smith.langchain.com"],
    ["gcp-eu", "https://eu.api.smith.langchain.com"],
    ["gcp-apac", "https://apac.api.smith.langchain.com"],
    ["aws-us", "https://aws.api.smith.langchain.com"],
  ] as const)("maps LangSmith %s to %s", (region, baseUrl) => {
    expect(LANGSMITH_REGION_DEFINITIONS[region].baseUrl).toBe(baseUrl)
  })

  it.each([
    ["us", "https://api.braintrust.dev"],
    ["eu", "https://api-eu.braintrust.dev"],
  ] as const)("maps Braintrust %s to %s", (region, baseUrl) => {
    expect(BRAINTRUST_REGION_DEFINITIONS[region].baseUrl).toBe(baseUrl)
  })

  it("only ever points at cloud origins over HTTPS", () => {
    for (const definitions of ALL_DEFINITIONS) {
      for (const { baseUrl } of Object.values(definitions)) {
        const url = new URL(baseUrl)
        expect(url.protocol).toBe("https:")
        // No path, query or credentials: adapters append their own paths to this origin.
        expect(url.pathname).toBe("/")
        expect(url.search).toBe("")
        expect(url.username).toBe("")
      }
    }
  })

  it("gives every source at least one region to pick", () => {
    for (const source of IMPORT_SOURCES) {
      expect(IMPORT_SOURCE_REGION_OPTIONS[source].length).toBeGreaterThan(0)
    }
  })

  it("labels every region, since the id alone is not something a user recognises", () => {
    for (const definitions of ALL_DEFINITIONS) {
      for (const { label } of Object.values(definitions)) {
        expect(label.length).toBeGreaterThan(0)
      }
    }
  })

  // The client only ever sees ids and labels; leaking the table would invite a caller to
  // start sending origins of its own.
  it("exposes no base URLs to the client", () => {
    expect(JSON.stringify(IMPORT_SOURCE_REGION_OPTIONS)).not.toContain("https://")
  })

  describe("isKnownImportBaseUrl", () => {
    it("accepts every origin in the table", () => {
      for (const definitions of ALL_DEFINITIONS) {
        for (const { baseUrl } of Object.values(definitions)) {
          expect(isKnownImportBaseUrl(baseUrl)).toBe(true)
        }
      }
    })

    // This is the gate that replaced host validation: a stored config can only ever hold an
    // origin we put there, so there is nothing for a hand-edited row to redirect.
    it.each([
      ["an internal address", "http://169.254.169.254"],
      ["localhost", "http://localhost:6379"],
      ["a private range", "https://10.0.0.5"],
      ["a lookalike domain", "https://cloud.langfuse.com.evil.test"],
      ["a plain-HTTP downgrade", "http://cloud.langfuse.com"],
      ["a trailing slash", "https://cloud.langfuse.com/"],
      ["an empty string", ""],
    ])("rejects %s", (_label, baseUrl) => {
      expect(isKnownImportBaseUrl(baseUrl)).toBe(false)
    })
  })

  describe("importSourceBaseUrl", () => {
    it("resolves each source's credentials to its region's origin", () => {
      expect(importSourceBaseUrl({ kind: "langfuse", region: "jp", publicKey: "pk", secretKey: "sk" })).toBe(
        "https://jp.cloud.langfuse.com",
      )
      expect(importSourceBaseUrl({ kind: "langsmith", region: "gcp-eu", apiKey: "k" })).toBe(
        "https://eu.api.smith.langchain.com",
      )
      expect(importSourceBaseUrl({ kind: "braintrust", region: "eu", apiKey: "k" })).toBe(
        "https://api-eu.braintrust.dev",
      )
    })

    it("only ever returns an origin the config gate would accept", () => {
      expect(isKnownImportBaseUrl(importSourceBaseUrl({ kind: "braintrust", region: "us", apiKey: "k" }))).toBe(true)
    })
  })
})
