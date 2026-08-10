import { describe, expect, it } from "vitest"
import { resolveErrorTypeFromMetadata } from "./error.ts"
import { resolveModelFromMetadata, resolveProviderFromMetadata, resolveUserEmailFromMetadata } from "./identity.ts"
import { resolveResponseIdFromMetadata } from "./response.ts"
import { resolveToolDefinitionsFromMetadata } from "./tool-definitions.ts"
import { resolveToolExecutionFromMetadata } from "./tool-execution.ts"

// A trace import has a flat metadata map rather than a span's attribute list. These are the shapes
// the three sources actually hand back, which is what the adapters used to miss: they read a single
// `provider` key that no vendor emits, so every imported span lost its provider — and with it the
// fallback cost estimate, which cannot price a model without one.
describe("resolveProviderFromMetadata", () => {
  it.each([
    ["Langfuse, whose OTLP export nests attributes under a prefix", { "attributes.gen_ai.provider.name": "openai" }],
    ["Braintrust, which keeps them flat", { "gen_ai.provider.name": "openai" }],
    ["the deprecated v1.36 attribute", { "gen_ai.system": "openai" }],
    ["Cloudflare's AI Gateway export", { "gen_ai.model.provider": "openai" }],
    ["Vercel's, with its transport suffix stripped", { "ai.model.provider": "openai.responses" }],
    ["a source that chose the bare name", { provider: "openai" }],
  ])("resolves %s", (_label, metadata) => {
    expect(resolveProviderFromMetadata(metadata)).toBe("openai")
  })

  // LangChain's own run metadata. Flat rather than nested, because the adapters flatten the vendor's
  // metadata map before it gets here.
  it("resolves LangSmith's ls_provider as a flat key", () => {
    expect(resolveProviderFromMetadata({ ls_provider: "anthropic" })).toBe("anthropic")
  })

  it("resolves ls_provider nested in an OpenInference metadata attribute", () => {
    expect(resolveProviderFromMetadata({ metadata: JSON.stringify({ ls_provider: "anthropic" }) })).toBe("anthropic")
  })

  it("normalizes an aliased name", () => {
    expect(resolveProviderFromMetadata({ "llm.system": "MistralAI" })).toBe("mistral")
  })

  it("prefers the OTEL attribute over a source's own name", () => {
    expect(resolveProviderFromMetadata({ "gen_ai.provider.name": "openai", provider: "mistral" })).toBe("openai")
  })

  it.each([
    ["no provider anywhere", { channel: "email" }],
    ["a non-string value", { "gen_ai.provider.name": 7 }],
    ["an empty string", { "gen_ai.provider.name": "" }],
    ["no metadata at all", null],
    ["undefined metadata", undefined],
  ])("returns empty for %s", (_label, metadata) => {
    expect(resolveProviderFromMetadata(metadata as Record<string, unknown> | null | undefined)).toBe("")
  })
})

// Each of these resolves by the same candidate list a live span does. The point of the shared list is
// that an import sees every key ingest knows about, so these assert the keys the import never read
// when it kept its own subset.
describe("resolveToolExecutionFromMetadata", () => {
  const toolSpan = (metadata: Record<string, unknown>, payload?: unknown) =>
    resolveToolExecutionFromMetadata({
      metadata,
      operation: "execute_tool",
      spanName: "running tool: lookup_order",
      input: payload,
      output: undefined,
    })

  describe("tool name", () => {
    it.each([
      ["the semconv attribute", { "gen_ai.tool.name": "lookup_order" }],
      ["it nested under Langfuse's prefix", { "attributes.gen_ai.tool.name": "lookup_order" }],
      ["OpenInference's", { "tool.name": "lookup_order" }],
      ["Traceloop's, which the import used to drop", { "traceloop.entity.name": "lookup_order" }],
      ["Vercel's, which the import used to drop", { "ai.toolCall.name": "lookup_order" }],
    ])("resolves %s", (_label, metadata) => {
      expect(toolSpan(metadata).toolName).toBe("lookup_order")
    })

    // Braintrust keeps the instrumentation's own span name, so the metadata key has to win or tool
    // analytics grows a separate tool called `running tool: lookup_order`.
    it("falls back to the span name only when no key names a tool", () => {
      expect(toolSpan({ "tool.description": "looks up an order" }).toolName).toBe("running tool: lookup_order")
    })
  })

  describe("tool call id", () => {
    it.each([
      ["the semconv attribute, which the import used to drop", { "gen_ai.tool.call.id": "call_9" }],
      ["Vercel's, which the import used to drop", { "ai.toolCall.id": "call_9" }],
      ["OpenInference's dotted key", { "tool_call.id": "call_9" }],
      ["the underscored name a vendor SDK writes", { tool_call_id: "call_9" }],
      ["its camelCase spelling", { toolCallId: "call_9" }],
    ])("resolves %s", (_label, metadata) => {
      expect(toolSpan(metadata).toolCallId).toBe("call_9")
    })

    it("prefers the OTEL attribute over a vendor's own name", () => {
      expect(toolSpan({ "gen_ai.tool.call.id": "call_otel", tool_call_id: "call_vendor" }).toolCallId).toBe("call_otel")
    })

    // Some sources keep the id inside the call arguments rather than beside them.
    it("falls back to the arguments payload when the metadata names no call", () => {
      expect(toolSpan({}, { tool_call_id: "call_from_input" }).toolCallId).toBe("call_from_input")
      expect(toolSpan({ tool_call_id: "call_from_metadata" }, { tool_call_id: "ignored" }).toolCallId).toBe(
        "call_from_metadata",
      )
    })

    it.each([
      ["a payload that is not an object", "a plain string"],
      ["no payload", undefined],
    ])("returns empty for %s and metadata naming no call", (_label, payload) => {
      expect(toolSpan({}, payload).toolCallId).toBe("")
    })
  })

  it("carries the arguments and the result as the call's input and output", () => {
    const resolved = resolveToolExecutionFromMetadata({
      metadata: { "gen_ai.tool.name": "lookup_order" },
      operation: "execute_tool",
      spanName: "tool",
      input: { order_id: "A-1" },
      output: "shipped",
    })

    expect(resolved.toolInput).toBe('{"order_id":"A-1"}')
    expect(resolved.toolOutput).toBe("shipped")
  })

  // Same gate as the attribute resolver: the tool columns exist to describe a tool span, and a
  // `tool_call_id` a caller left on an LLM span names no call this span answered.
  it("resolves nothing for a span that ran no tool", () => {
    const resolved = resolveToolExecutionFromMetadata({
      metadata: { "gen_ai.tool.name": "lookup_order", tool_call_id: "call_9" },
      operation: "chat",
      spanName: "chat gpt-5",
      input: { messages: [] },
      output: undefined,
    })

    expect(resolved).toEqual({ toolCallId: "", toolName: "", toolInput: "", toolOutput: "" })
  })
})

describe("resolveModelFromMetadata", () => {
  it.each([
    ["the semconv attribute, which the import used to drop", { "gen_ai.request.model": "gpt-4o-mini" }],
    ["OpenInference's, which the import used to drop", { "llm.model_name": "gpt-4o-mini" }],
    ["Vercel's, which the import used to drop", { "ai.model.id": "gpt-4o-mini" }],
    ["the bare key a vendor writes into its own metadata", { model: "gpt-4o-mini" }],
  ])("resolves %s", (_label, metadata) => {
    expect(resolveModelFromMetadata(metadata)).toBe("gpt-4o-mini")
  })

  // Claude Code wraps the model name in ANSI colour codes. Stripping them is the candidate's job, so
  // an imported Claude Code span groups with the same model ingested live instead of forming its own.
  it("strips the ANSI escape codes Claude Code wraps a model name in", () => {
    expect(resolveModelFromMetadata({ model: "[32mclaude-opus-4-5[0m" })).toBe("claude-opus-4-5")
  })

  it("reads a source's own key after the candidates", () => {
    expect(resolveModelFromMetadata({ ls_model_name: "claude-sonnet-4-5" }, ["ls_model_name"])).toBe(
      "claude-sonnet-4-5",
    )
    expect(
      resolveModelFromMetadata({ "gen_ai.request.model": "gpt-4o-mini", ls_model_name: "claude" }, ["ls_model_name"]),
    ).toBe("gpt-4o-mini")
  })

  it("returns empty when no key names a model", () => {
    expect(resolveModelFromMetadata({ "gen_ai.provider.name": "openai" }, ["ls_model_name"])).toBe("")
  })
})

describe("resolveUserEmailFromMetadata", () => {
  it.each([
    ["Langfuse's own key, which the import used to drop", { "langfuse.user.email": "dev@acme.com" }],
    ["the OpenInference key, which the import used to drop", { "user.email": "dev@acme.com" }],
    ["the OTEL enduser key, which the import used to drop", { "enduser.email": "dev@acme.com" }],
    ["the plain name a caller writes", { user_email: "dev@acme.com" }],
    ["its camelCase spelling", { userEmail: "dev@acme.com" }],
    ["the bare key", { email: "dev@acme.com" }],
  ])("resolves %s", (_label, metadata) => {
    expect(resolveUserEmailFromMetadata(metadata)).toBe("dev@acme.com")
  })

  it("returns empty when no key names an email", () => {
    expect(resolveUserEmailFromMetadata({ "user.id": "u_1" })).toBe("")
  })
})

describe("resolveResponseIdFromMetadata", () => {
  it.each([
    ["the semconv attribute", { "gen_ai.response.id": "chatcmpl-1" }],
    ["Vercel's, which the import used to drop", { "ai.response.id": "chatcmpl-1" }],
    ["the snake_case name a caller writes", { response_id: "chatcmpl-1" }],
    ["its camelCase spelling", { responseId: "chatcmpl-1" }],
  ])("resolves %s", (_label, metadata) => {
    expect(resolveResponseIdFromMetadata(metadata)).toBe("chatcmpl-1")
  })

  it("returns empty when no key names a response", () => {
    expect(resolveResponseIdFromMetadata({ "gen_ai.request.model": "gpt-5" })).toBe("")
  })
})

describe("resolveErrorTypeFromMetadata", () => {
  it.each([
    ["the semconv attribute", { "error.type": "RateLimitError" }],
    ["the name recordException writes", { "exception.type": "RateLimitError" }],
    ["either nested under Langfuse's prefix", { "attributes.exception.type": "RateLimitError" }],
  ])("resolves %s", (_label, metadata) => {
    expect(resolveErrorTypeFromMetadata(metadata)).toBe("RateLimitError")
  })

  // A literal "error" would read as a real type and collapse every distinct failure into one group.
  it("returns empty rather than inventing a type when the source recorded none", () => {
    expect(resolveErrorTypeFromMetadata({ "error.message": "429 Too Many Requests" })).toBe("")
  })
})

describe("resolveToolDefinitionsFromMetadata", () => {
  it.each([
    ["flat, as Braintrust keeps it", "gen_ai.tool.definitions"],
    ["nested, as Langfuse's OTLP export does", "attributes.gen_ai.tool.definitions"],
  ])("resolves the declared tool set %s", (_label, key) => {
    const tools = JSON.stringify([{ type: "function", function: { name: "lookup_order" } }])

    expect(resolveToolDefinitionsFromMetadata({ [key]: tools })).toBe(tools)
  })

  it("returns undefined when the source declared none", () => {
    expect(resolveToolDefinitionsFromMetadata({ "gen_ai.request.model": "gpt-5" })).toBeUndefined()
  })
})
