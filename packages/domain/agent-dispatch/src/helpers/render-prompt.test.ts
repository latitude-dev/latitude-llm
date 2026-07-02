import { describe, expect, it } from "vitest"
import { buildDispatchIdempotencyKey } from "./idempotency-key.ts"
import { renderDispatchPrompt } from "./render-prompt.ts"

describe("buildDispatchIdempotencyKey", () => {
  it("keys by vendor, config, trigger, source id, and dispatch window", () => {
    expect(
      buildDispatchIdempotencyKey({
        vendor: "webhook",
        configId: "cfg123",
        trigger: "incident.opened",
        sourceId: "clinc456",
        dispatchWindow: "2026-07-01",
      }),
    ).toBe("webhook:cfg123:incident.opened:clinc456:2026-07-01")
  })
})

describe("renderDispatchPrompt", () => {
  it("renders the default prompt without empty optional fields", () => {
    const prompt = renderDispatchPrompt({
      context: {
        trigger: "signal.discovered",
        organizationName: "Acme",
        projectName: "My App",
        projectSlug: "my-app",
        signal: {
          id: "sig1",
          slug: "timeout-errors",
          name: "Timeout errors",
          source: "flagger",
          priority: null,
        },
        deepLinkUrl: "https://console.latitude.so/projects/my-app/signals/timeout-errors",
      },
    })
    expect(prompt).toContain("My App")
    expect(prompt).toContain("Timeout errors")
    expect(prompt).toContain("sig1")
    expect(prompt).toContain("console.latitude.so")
    expect(prompt).not.toContain("Incident:")
    expect(prompt).not.toContain("Severity:")
    expect(prompt).not.toContain("Tags:")
    expect(prompt).toContain("If Latitude MCP tools are available")
  })

  it("includes sample conversation excerpts", () => {
    const prompt = renderDispatchPrompt({
      context: {
        trigger: "signal.discovered",
        organizationName: "Acme",
        projectName: "My App",
        projectSlug: "my-app",
        signal: {
          id: "sig1",
          slug: "timeout-errors",
          name: "Timeout errors",
          source: "flagger",
          priority: null,
        },
        deepLinkUrl: "https://console.latitude.so/projects/my-app/signals/timeout-errors",
        sampleConversations: [
          {
            traceId: "trace1",
            scoreFeedback: "Tool repeated",
            excerpt: "[0] user:\nhello\n\n[1] assistant <-- score anchor:\ncalled tool twice",
          },
        ],
      },
    })
    expect(prompt).toContain("Sample conversation excerpts")
    expect(prompt).toContain("trace1")
    expect(prompt).toContain("called tool twice")
  })

  it("still substitutes placeholders for custom templates", () => {
    const prompt = renderDispatchPrompt({
      template: "Investigate {{signal.name}} in {{projectName}}",
      context: {
        trigger: "signal.discovered",
        organizationName: "Acme",
        projectName: "My App",
        projectSlug: "my-app",
        signal: {
          id: "sig1",
          slug: "timeout-errors",
          name: "Timeout errors",
          source: "flagger",
          priority: null,
        },
        deepLinkUrl: "https://console.latitude.so/projects/my-app/signals/timeout-errors",
      },
    })
    expect(prompt).toBe("Investigate Timeout errors in My App")
  })

  it("joins array fields and leaves missing optional fields empty", () => {
    const prompt = renderDispatchPrompt({
      context: {
        trigger: "signal.discovered",
        organizationName: "Acme",
        projectName: "App",
        projectSlug: "app",
        tags: ["latency", "timeout"],
        sampleTraceIds: ["tr_1", "tr_2"],
        deepLinkUrl: "https://console.latitude.so/projects/app",
      },
      template: "Tags: {{tags}} | Traces: {{sampleTraceIds}} | Signal: {{signal.name}}",
    })
    expect(prompt).toBe("Tags: latency, timeout | Traces: tr_1, tr_2 | Signal: ")
  })
})
