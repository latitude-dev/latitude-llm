import { describe, expect, it } from "vitest"
import type { Operation } from "../../entities/span.ts"
import { resolveOperationFromSourceKind } from "./operation.ts"

/** The names each source coined itself. Everything else it took from OpenInference. */
const LANGFUSE: Record<string, Operation> = { GENERATION: "chat", SPAN: "chain", EVENT: "unspecified" }
const LANGSMITH: Record<string, Operation> = { chat_model: "chat", parser: "chain" }
const BRAINTRUST: Record<string, Operation> = {
  task: "invoke_agent",
  function: "execute_tool",
  score: "evaluator",
  eval: "evaluator",
  review: "evaluator",
}

describe("resolveOperationFromSourceKind", () => {
  // Every mapping the three adapters carried before they read OpenInference's list. A change here is a
  // change to what the trace rollup counts, so the whole table is pinned rather than sampled.
  describe("the vocabulary each source arrives with", () => {
    it.each([
      ["GENERATION", "chat"],
      ["SPAN", "chain"],
      ["EVENT", "unspecified"],
      ["AGENT", "invoke_agent"],
      ["TOOL", "execute_tool"],
      ["CHAIN", "chain"],
      ["RETRIEVER", "retrieval"],
      ["EVALUATOR", "evaluator"],
      ["EMBEDDING", "embeddings"],
      ["GUARDRAIL", "guardrail"],
    ])("maps Langfuse's %s to %s", (kind, operation) => {
      expect(resolveOperationFromSourceKind(kind, LANGFUSE)).toBe(operation)
    })

    it.each([
      ["llm", "chat"],
      ["chat_model", "chat"],
      ["chain", "chain"],
      ["tool", "execute_tool"],
      ["retriever", "retrieval"],
      ["embedding", "embeddings"],
      ["prompt", "prompt"],
      ["parser", "chain"],
    ])("maps LangSmith's %s to %s", (kind, operation) => {
      expect(resolveOperationFromSourceKind(kind, LANGSMITH)).toBe(operation)
    })

    it.each([
      ["llm", "chat"],
      ["task", "invoke_agent"],
      ["tool", "execute_tool"],
      ["function", "execute_tool"],
      ["score", "evaluator"],
      ["eval", "evaluator"],
      ["review", "evaluator"],
    ])("maps Braintrust's %s to %s", (kind, operation) => {
      expect(resolveOperationFromSourceKind(kind, BRAINTRUST)).toBe(operation)
    })
  })

  // Langfuse keeps OpenInference's case, LangSmith lower-cases it, so one list has to answer for both.
  it("folds case, so a source's own casing does not matter", () => {
    for (const kind of ["tool", "TOOL", "Tool"]) {
      expect(resolveOperationFromSourceKind(kind)).toBe("execute_tool")
    }
  })

  it("lets a name a source coined override the OpenInference kind it collides with", () => {
    expect(resolveOperationFromSourceKind("tool", { tool: "invoke_agent" })).toBe("invoke_agent")
  })

  /**
   * The rollup gates its token sums on the operation, so an unmapped vendor string would insert
   * cleanly and read back as a trace with no messages and no tokens.
   */
  it.each([
    ["a kind no convention names", "sub_workflow"],
    ["an empty kind", ""],
    ["no kind at all", undefined],
    ["a null kind", null],
  ])("answers unspecified for %s", (_label, kind) => {
    expect(resolveOperationFromSourceKind(kind, BRAINTRUST)).toBe("unspecified")
  })
})
