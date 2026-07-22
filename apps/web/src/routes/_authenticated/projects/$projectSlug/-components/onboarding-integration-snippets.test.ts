import { describe, expect, it } from "vitest"
import {
  cloudflareAiGatewayConfigSnippet,
  getOnboardingSnippet,
  getProviderSdkPyInstallCommand,
  ONBOARDING_PROVIDER_SNIPPET_CONFIG,
  providerUsesLatitudeSdk,
} from "./onboarding-integration-snippets.ts"

describe("Pydantic AI onboarding integration", () => {
  it("is registered as a Python-only provider", () => {
    const cfg = ONBOARDING_PROVIDER_SNIPPET_CONFIG["pydantic-ai"]
    expect(cfg).toEqual({ id: "pydantic-ai", supportsTypescript: false, supportsPython: true })
  })

  it("uses the Latitude SDK path", () => {
    expect(providerUsesLatitudeSdk("pydantic-ai")).toBe(true)
  })

  it("installs the full pydantic-ai package (bundles the openai extra)", () => {
    expect(getProviderSdkPyInstallCommand("pydantic-ai", "pip")).toBe("pip install pydantic-ai")
    expect(getProviderSdkPyInstallCommand("pydantic-ai", "uv")).toBe("uv add pydantic-ai")
    expect(getProviderSdkPyInstallCommand("pydantic-ai", "poetry")).toBe("poetry add pydantic-ai")
  })

  it("has no TypeScript snippet", () => {
    expect(getOnboardingSnippet("pydantic-ai", "typescript", "my-project", "lat-key")).toBeNull()
  })

  describe("Python snippet", () => {
    const snippet = getOnboardingSnippet("pydantic-ai", "python", "my-project", "lat-key")

    it("returns a snippet", () => {
      expect(snippet).not.toBeNull()
    })

    it("wires the Latitude SDK and Pydantic AI's native instrumentation", () => {
      expect(snippet).toContain("from latitude_telemetry import Latitude, capture")
      expect(snippet).toContain("from pydantic_ai import Agent")
      expect(snippet).toContain("Agent.instrument_all()")
    })

    it("does not register an instrumentations entry (Pydantic AI self-instruments)", () => {
      expect(snippet).not.toContain("instrumentations={")
    })

    it("injects the project slug and API key", () => {
      expect(snippet).toContain('project="my-project"')
      expect(snippet).toContain('api_key="lat-key"')
      expect(snippet).not.toContain('os.environ["LATITUDE_PROJECT_SLUG"]')
      expect(snippet).not.toContain('os.environ["LATITUDE_API_KEY"]')
    })

    it("flushes on exit for short-lived processes", () => {
      expect(snippet).toContain("latitude.shutdown()")
    })
  })
})

describe("Cloudflare AI Gateway onboarding integration", () => {
  it("is registered as an OpenTelemetry-only provider (no SDK snippets)", () => {
    const cfg = ONBOARDING_PROVIDER_SNIPPET_CONFIG["cloudflare-ai-gateway"]
    expect(cfg).toEqual({ id: "cloudflare-ai-gateway", supportsTypescript: false, supportsPython: false })
  })

  it("has neither a TypeScript nor a Python snippet", () => {
    expect(getOnboardingSnippet("cloudflare-ai-gateway", "typescript", "my-project", "lat-key")).toBeNull()
    expect(getOnboardingSnippet("cloudflare-ai-gateway", "python", "my-project", "lat-key")).toBeNull()
  })

  describe("exporter config snippet", () => {
    const snippet = cloudflareAiGatewayConfigSnippet("my-project", "lat-key")

    it("points at the Latitude OTLP traces endpoint", () => {
      expect(snippet).toContain("https://ingest.latitude.so/v1/traces")
    })

    it("injects the API key and project slug into the headers", () => {
      expect(snippet).toContain("Authorization: Bearer lat-key")
      expect(snippet).toContain("X-Latitude-Project: my-project")
    })

    it("falls back to a placeholder when no API key is available", () => {
      expect(cloudflareAiGatewayConfigSnippet("my-project", null)).toContain("Authorization: Bearer YOUR_API_KEY")
    })
  })
})
