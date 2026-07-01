import { describe, expect, it } from "vitest"
import { formatSpanDisplayLabel, isSubagentSpan, resolveAgentLabel, resolveSpanLabels } from "./span-display.ts"

describe("span-display", () => {
  it("resolves agent labels from OTel and framework-specific attributes", () => {
    expect(resolveAgentLabel({ "gen_ai.agent.name": "travel-agent" })).toBe("travel-agent")
    expect(resolveAgentLabel({ "openclaw.subagent.label": "research" })).toBe("research")
    expect(resolveAgentLabel({ "subagent.id": "Explore:a4dabb47" })).toBe("Explore:a4dabb47")
  })

  it("detects subagent spans across semconv and framework shapes", () => {
    expect(isSubagentSpan({ name: "subagent", operation: "create_agent" })).toBe(true)
    expect(
      isSubagentSpan({
        name: "interaction",
        operation: "invoke_agent",
        attrString: { "interaction.kind": "subagent" },
      }),
    ).toBe(true)
    expect(
      isSubagentSpan({
        name: "invoke_agent gpt-4o",
        operation: "invoke_agent",
        parentOperation: "execute_tool",
      }),
    ).toBe(true)
    expect(isSubagentSpan({ name: "chat gpt-4o", operation: "chat" })).toBe(false)
  })

  it("appends agent labels without duplicating text already in the span name", () => {
    expect(
      formatSpanDisplayLabel({
        name: "invoke_agent gpt-4o",
        operation: "invoke_agent",
        attrString: { "gen_ai.agent.name": "travel-agent" },
      }),
    ).toBe("invoke_agent gpt-4o · travel-agent")

    expect(
      formatSpanDisplayLabel({
        name: "invoke_agent travel-agent",
        operation: "invoke_agent",
        attrString: { "gen_ai.agent.name": "travel-agent" },
      }),
    ).toBe("invoke_agent travel-agent")
  })

  it("resolves labels for an entire trace with parent context", () => {
    const labels = resolveSpanLabels([
      {
        spanId: "tool",
        parentSpanId: "root",
        name: "execute_tool runSubagent",
        operation: "execute_tool",
        attrString: {},
      },
      {
        spanId: "child",
        parentSpanId: "tool",
        name: "invoke_agent gpt-4o",
        operation: "invoke_agent",
        attrString: { "gen_ai.agent.name": "explore" },
      },
    ])

    expect(labels.get("child")).toEqual({
      displayLabel: "invoke_agent gpt-4o · explore",
      isSubagent: true,
    })
  })
})
