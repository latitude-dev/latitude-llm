/**
 * Cloudflare AI Gateway ingestion — built from spans captured live from the gateway's OTLP
 * export (embedding vector trimmed). The gateway emits standard `gen_ai.*` metadata, so
 * provider/model/tokens/cost/operation resolve out of the box. The catch is content: it reuses
 * the standard `gen_ai.{input,output}.messages` keys but with non-standard values —
 *   input  = the raw request body `{messages:[...]}` (or `{text}` for embeddings)
 *   output = the upstream provider's native response (Anthropic `{state,result:{content[]}}`,
 *            OpenAI-compat `{choices:[{message}]}`, or embeddings `{data,shape}`)
 * and it hardcodes `gen_ai.operation.name=chat` for every request, including embeddings.
 */

import type { GenAIMessage } from "rosetta-ai"
import { beforeAll, describe, expect, it } from "vitest"
import type { SpanDetail } from "../../entities/span.ts"
import type { TransformContext } from "../transform.ts"
import { transformOtlpToSpans } from "../transform.ts"
import type { OtlpExportTraceServiceRequest, OtlpKeyValue, OtlpSpan } from "../types.ts"

function str(key: string, value: string): OtlpKeyValue {
  return { key, value: { stringValue: value } }
}
// Cloudflare emits intValue as a JSON number, not the spec's string; reproduce that faithfully.
function num(key: string, value: number): OtlpKeyValue {
  return { key, value: { intValue: value as unknown as string } }
}
function dbl(key: string, value: number): OtlpKeyValue {
  return { key, value: { doubleValue: value } }
}

const TRACE_ID = "b4c2208f7b3f4c9f976d4faa4f3a2427"
const MICROCENTS_PER_USD = 100_000_000

const SPAN_IDS = {
  anthropic: "7d7662e21d063fd9",
  workers: "110763ce674f4de0",
  embeddings: "8f97ce44b9f1975d",
} as const

const CONTEXT: TransformContext = {
  organizationId: "org_test",
  apiKeyId: "key_test",
  ingestedAt: new Date("2026-06-18T12:00:00Z"),
  defaultProjectId: "proj_test",
  projectIdBySlug: new Map(),
}

function cfSpan(spanId: string, attributes: OtlpKeyValue[]): OtlpSpan {
  return {
    traceId: TRACE_ID,
    spanId,
    name: "cf.aig.request",
    kind: 1,
    startTimeUnixNano: "1784711816489000000",
    endTimeUnixNano: "1784711817922000000",
    attributes,
    status: { code: 0 },
  }
}

// Anthropic chat — output wrapped in {state, result:<Anthropic Messages response>}.
function anthropicSpan(): OtlpSpan {
  return cfSpan(SPAN_IDS.anthropic, [
    str("gen_ai.operation.name", "chat"),
    str("gen_ai.request.model", "anthropic/claude-sonnet-5"),
    str("gen_ai.provider.name", "anthropic"),
    num("gen_ai.usage.input_tokens", 15),
    num("gen_ai.usage.output_tokens", 128),
    str(
      "gen_ai.input.messages",
      JSON.stringify({ messages: [{ role: "user", content: "What is Cloudflare?" }], max_tokens: 128 }),
    ),
    str(
      "gen_ai.output.messages",
      JSON.stringify({
        state: "Completed",
        result: {
          id: "msg_011CdGqvCqwcFxFEUkQZzsVj",
          type: "message",
          role: "assistant",
          content: [{ type: "text", text: "# Cloudflare\n\nCloudflare is a web infrastructure and security company." }],
          model: "claude-sonnet-5",
          stop_reason: "max_tokens",
        },
      }),
    ),
    dbl("gen_ai.usage.cost", 0.00131),
  ])
}

// Workers AI chat (gpt-oss, served OpenAI-compatible) — output is a raw chat.completion.
function workersSpan(): OtlpSpan {
  return cfSpan(SPAN_IDS.workers, [
    str("gen_ai.operation.name", "chat"),
    str("gen_ai.request.model", "@cf/openai/gpt-oss-120b"),
    str("gen_ai.provider.name", "internal-workers-ai"),
    num("gen_ai.usage.input_tokens", 73),
    num("gen_ai.usage.output_tokens", 41),
    str(
      "gen_ai.input.messages",
      JSON.stringify({ messages: [{ role: "user", content: "Say hi in one sentence." }], max_tokens: 128 }),
    ),
    str(
      "gen_ai.output.messages",
      JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            index: 0,
            message: { role: "assistant", content: "Hello! I'm glad you're here.", tool_calls: [] },
          },
        ],
        object: "chat.completion",
        model: "@cf/openai/gpt-oss-120b",
      }),
    ),
    dbl("gen_ai.usage.cost", 0.0000563),
  ])
}

// Embeddings — operation hardcoded to chat by the gateway; input {text}, output {data,shape}.
function embeddingsSpan(): OtlpSpan {
  return cfSpan(SPAN_IDS.embeddings, [
    str("gen_ai.operation.name", "chat"),
    str("gen_ai.request.model", "@cf/baai/bge-base-en-v1.5"),
    str("gen_ai.provider.name", "internal-workers-ai"),
    num("gen_ai.usage.input_tokens", 4),
    num("gen_ai.usage.output_tokens", 0),
    str("gen_ai.input.messages", JSON.stringify({ text: "hello world" })),
    str("gen_ai.output.messages", JSON.stringify({ data: [[0.0039, 0.045, 0.037]], shape: [1, 768], pooling: "mean" })),
    dbl("gen_ai.usage.cost", 2.68e-7),
  ])
}

function buildTrace(): OtlpExportTraceServiceRequest {
  return {
    resourceSpans: [
      {
        resource: { attributes: [str("service.name", "ai-gateway")] },
        scopeSpans: [{ scope: { name: "ai" }, spans: [anthropicSpan(), workersSpan(), embeddingsSpan()] }],
      },
    ],
  }
}

function textOf(messages: readonly GenAIMessage[]): string {
  return messages
    .flatMap((m) => (Array.isArray(m.parts) ? m.parts : []))
    .filter((p) => (p as { type?: string }).type === "text")
    .map((p) => (p as { content?: unknown }).content)
    .join(" ")
}

describe("Cloudflare AI Gateway — OTLP GenAI export", () => {
  let spans: SpanDetail[]
  const findSpan = (id: keyof typeof SPAN_IDS) => {
    const s = spans.find((s) => s.spanId === SPAN_IDS[id])
    if (!s) throw new Error(`Span ${id} not found`)
    return s
  }

  beforeAll(() => {
    spans = transformOtlpToSpans(buildTrace(), CONTEXT).spans as typeof spans
  })

  describe("metadata (resolves from standard gen_ai.* keys)", () => {
    it("resolves provider, aliasing internal-workers-ai to cloudflare-workers-ai", () => {
      expect(findSpan("anthropic").provider).toBe("anthropic")
      expect(findSpan("workers").provider).toBe("cloudflare-workers-ai")
      expect(findSpan("embeddings").provider).toBe("cloudflare-workers-ai")
    })

    it("resolves model, tokens, and cost (cost from gen_ai.usage.cost)", () => {
      expect(findSpan("anthropic").model).toBe("anthropic/claude-sonnet-5")
      expect(findSpan("anthropic").tokensInput).toBe(15)
      expect(findSpan("anthropic").tokensOutput).toBe(128)
      expect(findSpan("anthropic").costTotalMicrocents).toBe(Math.round(0.00131 * MICROCENTS_PER_USD))
      expect(findSpan("workers").tokensInput).toBe(73)
      expect(findSpan("workers").costTotalMicrocents).toBe(Math.round(0.0000563 * MICROCENTS_PER_USD))
    })
  })

  describe("operation", () => {
    it("keeps chat for chat requests", () => {
      expect(findSpan("anthropic").operation).toBe("chat")
      expect(findSpan("workers").operation).toBe("chat")
    })

    it("reclassifies embeddings (gateway mislabels them chat)", () => {
      expect(findSpan("embeddings").operation).toBe("embeddings")
    })
  })

  describe("content (recovered from the non-standard envelopes)", () => {
    it("parses input from the request-body envelope", () => {
      expect(textOf(findSpan("anthropic").inputMessages)).toContain("What is Cloudflare?")
      expect(textOf(findSpan("workers").inputMessages)).toContain("Say hi in one sentence.")
    })

    it("parses the Anthropic output ({state,result:{content[]}})", () => {
      const out = findSpan("anthropic").outputMessages
      expect(out.some((m) => m.role === "assistant")).toBe(true)
      expect(textOf(out)).toContain("Cloudflare is a web infrastructure")
    })

    it("parses the OpenAI-compat output ({choices:[{message}]})", () => {
      const out = findSpan("workers").outputMessages
      expect(out.some((m) => m.role === "assistant")).toBe(true)
      expect(textOf(out)).toContain("glad you're here")
    })

    it("emits no messages for embeddings (never renders the vector)", () => {
      expect(findSpan("embeddings").inputMessages).toEqual([])
      expect(findSpan("embeddings").outputMessages).toEqual([])
    })
  })
})
