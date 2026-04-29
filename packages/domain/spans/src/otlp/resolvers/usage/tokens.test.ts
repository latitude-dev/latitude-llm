import { describe, expect, it } from "vitest"
import type { OtlpKeyValue } from "../../types.ts"
import { resolveTokens } from "./tokens.ts"

function int(key: string, value: number): OtlpKeyValue {
  return { key, value: { intValue: String(value) } }
}

// ─── Shared fixture ──────────────────────────────────────
//
// One canonical scenario used across test groups:
//
//   total input  = 10,000 tokens
//   cache read   =  8,000 tokens
//   cache create =  1,500 tokens
//   non-cached   =    500 tokens
//   total output =    200 tokens
//   reasoning    =     60 tokens
//   non-reasoning=    140 tokens
//   grand total  = 10,200 tokens

const EXPECTED = {
  input: 500,
  cacheRead: 8_000,
  cacheCreate: 1_500,
  output: 140,
  reasoning: 60,
  totalInput: 10_000,
  totalOutput: 200,
  grandTotal: 10_200,
} as const

describe("resolveTokens", () => {
  // ═══════════════════════════════════════════════════════
  // STRATEGY 1: TOTAL-BASED INFERENCE
  //
  // When rawTotal is present, arithmetic alone determines
  // the model — no provider or convention knowledge needed.
  // ═══════════════════════════════════════════════════════

  describe("strategy 1: total-based inference", () => {
    describe("inclusive input detected from total (rawInput + rawOutput === rawTotal)", () => {
      it("subtracts cache when total proves inclusive input", () => {
        const attrs = [
          int("llm.token_count.prompt", 10_000), // inclusive
          int("llm.token_count.completion", 200),
          int("llm.token_count.prompt_details.cache_read", 8_000),
          int("llm.token_count.prompt_details.cache_write", 1_500),
          int("llm.token_count.total", 10_200), // 10000 + 200 → proves inclusive
        ]
        // Provider says additive, but total proves inclusive → total wins
        const r = resolveTokens(attrs, "anthropic")
        expect(r.input).toBe(EXPECTED.input)
        expect(r.cacheRead).toBe(EXPECTED.cacheRead)
        expect(r.cacheCreate).toBe(EXPECTED.cacheCreate)
      })

      it("overrides provider heuristic when total disagrees", () => {
        // Hypothetical: passthrough convention with anthropic provider,
        // but the instrumentor already normalized to inclusive before emitting
        const attrs = [
          int("gen_ai.usage.prompt_tokens", 10_000), // instrumentor normalized to inclusive
          int("gen_ai.usage.completion_tokens", 200),
          int("gen_ai.usage.cache_read.input_tokens", 8_000),
          int("gen_ai.usage.total_tokens", 10_200), // proves inclusive
        ]
        const r = resolveTokens(attrs, "anthropic")
        expect(r.input).toBe(2_000) // 10000 - 8000
      })
    })

    describe("additive input detected from total (rawInput + cache + rawOutput === rawTotal)", () => {
      it("passes through input when total proves additive", () => {
        const attrs = [
          int("llm.token_count.prompt", 500), // additive (non-cached only)
          int("llm.token_count.completion", 200),
          int("llm.token_count.prompt_details.cache_read", 8_000),
          int("llm.token_count.prompt_details.cache_write", 1_500),
          int("llm.token_count.total", 10_200), // 500 + 9500 + 200 → proves additive
        ]
        // Provider says inclusive, but total proves additive → total wins
        const r = resolveTokens(attrs, "openai")
        expect(r.input).toBe(EXPECTED.input)
      })
    })

    describe("inclusive output detected from total", () => {
      it("subtracts reasoning when total proves output inclusive", () => {
        const attrs = [
          int("gen_ai.usage.input_tokens", 100),
          int("gen_ai.usage.output_tokens", 200), // includes reasoning
          int("gen_ai.usage.reasoning_tokens", 60),
          int("gen_ai.usage.total_tokens", 300), // 100 + 200 → proves both inclusive
        ]
        const r = resolveTokens(attrs, "gcp.vertex_ai") // provider says additive output
        expect(r.output).toBe(140) // total overrides provider
        expect(r.reasoning).toBe(60)
      })
    })

    describe("additive output detected from total", () => {
      it("passes through output when total proves output additive", () => {
        const attrs = [
          int("gen_ai.usage.input_tokens", 100),
          int("gen_ai.usage.output_tokens", 140), // excludes reasoning
          int("gen_ai.usage.reasoning_tokens", 60),
          int("gen_ai.usage.total_tokens", 300), // 100 + 140 + 60 → proves output additive
        ]
        const r = resolveTokens(attrs, "openai") // provider says inclusive output
        expect(r.output).toBe(140) // total overrides provider
        expect(r.reasoning).toBe(60)
      })
    })

    describe("both sides determined from total", () => {
      it("additive input + additive output", () => {
        const attrs = [
          int("llm.token_count.prompt", 500),
          int("llm.token_count.completion", 140),
          int("llm.token_count.prompt_details.cache_read", 8_000),
          int("llm.token_count.prompt_details.cache_write", 1_500),
          int("llm.token_count.completion_details.reasoning", 60),
          int("llm.token_count.total", 10_200), // 500 + 9500 + 140 + 60 → both additive
        ]
        const r = resolveTokens(attrs, "unknown-provider")
        expect(r.input).toBe(500)
        expect(r.output).toBe(140)
      })

      it("inclusive input + inclusive output", () => {
        const attrs = [
          int("llm.token_count.prompt", 10_000),
          int("llm.token_count.completion", 200),
          int("llm.token_count.prompt_details.cache_read", 8_000),
          int("llm.token_count.prompt_details.cache_write", 1_500),
          int("llm.token_count.completion_details.reasoning", 60),
          int("llm.token_count.total", 10_200), // 10000 + 200 → both inclusive
        ]
        const r = resolveTokens(attrs, "unknown-provider")
        expect(r.input).toBe(500)
        expect(r.output).toBe(140)
      })
    })

    describe("partial inference (one sub-category is zero)", () => {
      it("determines input model when only cache exists (reasoning=0)", () => {
        const attrs = [
          int("gen_ai.usage.prompt_tokens", 500), // passthrough key
          int("gen_ai.usage.completion_tokens", 200),
          int("gen_ai.usage.cache_read.input_tokens", 8_000),
          int("gen_ai.usage.total_tokens", 8_700), // 500 + 8000 + 200 → input additive
        ]
        const r = resolveTokens(attrs, "openai") // provider says inclusive, total says additive
        expect(r.input).toBe(500) // total wins
        expect(r.output).toBe(200) // no reasoning → unchanged
      })

      it("determines output model when only reasoning exists (cache=0)", () => {
        const attrs = [
          int("gen_ai.usage.prompt_tokens", 100), // passthrough key
          int("gen_ai.usage.completion_tokens", 140),
          int("gen_ai.usage.reasoning_tokens", 60),
          int("gen_ai.usage.total_tokens", 300), // 100 + 140 + 60 → output additive
        ]
        const r = resolveTokens(attrs, "openai") // provider says inclusive output, total says additive
        expect(r.output).toBe(140) // total wins
        expect(r.input).toBe(100) // no cache → unchanged, falls back to convention/provider
      })
    })

    describe("total absent or zero → falls through to strategies 2+3", () => {
      it("falls back to provider detection when no total attribute exists", () => {
        const attrs = [
          int("llm.token_count.prompt", 500),
          int("llm.token_count.completion", 200),
          int("llm.token_count.prompt_details.cache_read", 8_000),
        ]
        // No total → falls back to provider (anthropic = additive)
        expect(resolveTokens(attrs, "anthropic").input).toBe(500)
        // No total → falls back to provider (openai = inclusive)
        expect(
          resolveTokens([...attrs.map((a) => (a.key === "llm.token_count.prompt" ? int(a.key, 8_500) : a))], "openai")
            .input,
        ).toBe(500)
      })
    })

    describe("total present but no match → falls through to strategies 2+3", () => {
      it("falls back when no formula reproduces the total (inconsistent span)", () => {
        const attrs = [
          int("gen_ai.usage.prompt_tokens", 500),
          int("gen_ai.usage.completion_tokens", 200),
          int("gen_ai.usage.cache_read.input_tokens", 8_000),
          int("gen_ai.usage.total_tokens", 99_999), // nonsensical
        ]
        // Falls back to provider
        const r = resolveTokens(attrs, "anthropic")
        expect(r.input).toBe(500) // provider-based: anthropic = additive
      })
    })
  })

  // ═══════════════════════════════════════════════════════
  // STRATEGY 2: ALWAYS INCLUSIVE INPUT (convention-level)
  //
  // These attribute keys guarantee inclusive input semantics
  // regardless of provider. Only fires when strategy 1
  // didn't determine input.
  // ═══════════════════════════════════════════════════════

  describe("strategy 2: always inclusive input keys (no total present)", () => {
    describe("gen_ai.usage.input_tokens (OTEL v1.37+)", () => {
      const attrs = [
        int("gen_ai.usage.input_tokens", 10_000),
        int("gen_ai.usage.output_tokens", 200),
        int("gen_ai.usage.cache_read.input_tokens", 8_000),
        int("gen_ai.usage.cache_creation.input_tokens", 1_500),
      ]

      it("subtracts cache for openai", () => {
        expect(resolveTokens(attrs, "openai").input).toBe(EXPECTED.input)
      })

      it("subtracts cache for anthropic (convention overrides provider)", () => {
        expect(resolveTokens(attrs, "anthropic").input).toBe(EXPECTED.input)
      })

      it("subtracts cache for bedrock (convention overrides provider)", () => {
        expect(resolveTokens(attrs, "aws.bedrock").input).toBe(EXPECTED.input)
      })
    })

    describe("gen_ai.usage.cache_creation_input_tokens (underscore variant — Anthropic-style OTel exporters, openclaw-telemetry)", () => {
      // Two spellings exist in the wild for the cache-create token attr:
      // the dot-separated form (`gen_ai.usage.cache_creation.input_tokens`)
      // matches the OTEL semconv structure, and the underscore form
      // (`gen_ai.usage.cache_creation_input_tokens`) matches what
      // Anthropic-style OTel exporters and openclaw-telemetry emit. Both
      // must resolve, otherwise cache-write tokens silently drop.
      const attrs = [
        int("gen_ai.usage.input_tokens", 10_000),
        int("gen_ai.usage.output_tokens", 200),
        int("gen_ai.usage.cache_read_input_tokens", 8_000),
        int("gen_ai.usage.cache_creation_input_tokens", 1_500),
      ]

      it("resolves cache_create from the underscore-spelling key", () => {
        const r = resolveTokens(attrs, "anthropic")
        expect(r.cacheCreate).toBe(EXPECTED.cacheCreate)
        expect(r.cacheRead).toBe(EXPECTED.cacheRead)
      })
    })

    describe("ai.usage.promptTokens (Vercel AI SDK v5)", () => {
      const attrs = [
        int("ai.usage.promptTokens", 10_000),
        int("ai.usage.completionTokens", 200),
        int("gen_ai.usage.cache_read.input_tokens", 8_000),
        int("gen_ai.usage.cache_creation.input_tokens", 1_500),
      ]

      it("subtracts cache regardless of provider", () => {
        expect(resolveTokens(attrs, "openai").input).toBe(EXPECTED.input)
        expect(resolveTokens(attrs, "anthropic").input).toBe(EXPECTED.input)
      })
    })

    describe("ai.usage.inputTokens (Vercel AI SDK v6+)", () => {
      const attrs = [
        int("ai.usage.inputTokens", 10_000),
        int("ai.usage.outputTokens", 200),
        int("ai.usage.cachedInputTokens", 8_000),
        int("ai.usage.inputTokenDetails.cacheWriteTokens", 1_500),
      ]

      it("subtracts cache regardless of provider", () => {
        expect(resolveTokens(attrs, "openai").input).toBe(EXPECTED.input)
        expect(resolveTokens(attrs, "anthropic").input).toBe(EXPECTED.input)
      })
    })
  })

  // ═══════════════════════════════════════════════════════
  // STRATEGY 3: PROVIDER-DEPENDENT (no total, passthrough
  // convention keys)
  // ═══════════════════════════════════════════════════════

  describe("strategy 3: provider-dependent (no total, passthrough keys)", () => {
    describe("input: llm.token_count.* (OpenInference)", () => {
      function attrs(prompt: number) {
        return [
          int("llm.token_count.prompt", prompt),
          int("llm.token_count.completion", 200),
          int("llm.token_count.prompt_details.cache_read", 8_000),
          int("llm.token_count.prompt_details.cache_write", 1_500),
        ]
      }

      describe("inclusive providers → subtract cache", () => {
        it.each(["openai", "google", "mistral_ai", "cohere", "groq", "deepseek"])("%s", (provider) => {
          expect(resolveTokens(attrs(10_000), provider).input).toBe(EXPECTED.input)
        })
      })

      describe("additive providers → pass through", () => {
        it.each(["anthropic", "aws.bedrock", "aws_bedrock", "bedrock", "amazon-bedrock"])("%s", (provider) => {
          expect(resolveTokens(attrs(500), provider).input).toBe(EXPECTED.input)
        })
      })
    })

    describe("input: gen_ai.usage.prompt_tokens (OpenLLMetry / OTEL v1.36)", () => {
      const cache = [
        int("gen_ai.usage.completion_tokens", 200),
        int("gen_ai.usage.cache_read.input_tokens", 8_000),
        int("gen_ai.usage.cache_creation.input_tokens", 1_500),
      ]

      it("subtracts cache for openai (inclusive)", () => {
        const attrs = [int("gen_ai.usage.prompt_tokens", 10_000), ...cache]
        expect(resolveTokens(attrs, "openai").input).toBe(EXPECTED.input)
      })

      it("passes through for anthropic (additive)", () => {
        const attrs = [int("gen_ai.usage.prompt_tokens", 500), ...cache]
        expect(resolveTokens(attrs, "anthropic").input).toBe(EXPECTED.input)
      })
    })

    describe("output: reasoning inclusive (most providers) → subtract", () => {
      it.each(["openai", "anthropic", "google", "mistral_ai", "cohere"])("%s", (provider) => {
        const attrs = [
          int("gen_ai.usage.input_tokens", 100),
          int("gen_ai.usage.output_tokens", 200),
          int("gen_ai.usage.reasoning_tokens", 60),
        ]
        const r = resolveTokens(attrs, provider)
        expect(r.output).toBe(EXPECTED.output)
        expect(r.reasoning).toBe(EXPECTED.reasoning)
      })
    })

    describe("output: reasoning additive (Vertex AI) → pass through", () => {
      it.each(["gcp.vertex_ai", "vertexai"])("%s", (provider) => {
        const attrs = [
          int("gen_ai.usage.input_tokens", 100),
          int("gen_ai.usage.output_tokens", 140),
          int("gen_ai.usage.reasoning_tokens", 60),
        ]
        const r = resolveTokens(attrs, provider)
        expect(r.output).toBe(140)
        expect(r.reasoning).toBe(60)
      })
    })
  })

  // ═══════════════════════════════════════════════════════
  // SAME ATTRIBUTES, DIFFERENT PROVIDERS — proves that the
  // same convention produces the same additive result from
  // different raw values depending on provider.
  // ═══════════════════════════════════════════════════════

  describe("same passthrough attributes, different providers → same additive result", () => {
    it("different raw values, identical normalized output", () => {
      const openaiAttrs = [
        int("llm.token_count.prompt", 10_000),
        int("llm.token_count.completion", 200),
        int("llm.token_count.prompt_details.cache_read", 8_000),
        int("llm.token_count.prompt_details.cache_write", 1_500),
      ]
      const anthropicAttrs = [
        int("llm.token_count.prompt", 500),
        int("llm.token_count.completion", 200),
        int("llm.token_count.prompt_details.cache_read", 8_000),
        int("llm.token_count.prompt_details.cache_write", 1_500),
      ]

      const rOpenai = resolveTokens(openaiAttrs, "openai")
      const rAnthropic = resolveTokens(anthropicAttrs, "anthropic")

      expect(rOpenai.input).toBe(rAnthropic.input)
      expect(rOpenai.cacheRead).toBe(rAnthropic.cacheRead)
      expect(rOpenai.cacheCreate).toBe(rAnthropic.cacheCreate)

      const total = (r: typeof rOpenai) => r.input + r.cacheRead + r.cacheCreate
      expect(total(rOpenai)).toBe(EXPECTED.totalInput)
      expect(total(rAnthropic)).toBe(EXPECTED.totalInput)
    })
  })

  // ═══════════════════════════════════════════════════════
  // NO SUB-CATEGORIES — when cache/reasoning are absent,
  // raw values pass through unchanged regardless of model.
  // ═══════════════════════════════════════════════════════

  describe("no sub-categories → pass through unchanged", () => {
    it("no cache attrs → input unchanged", () => {
      const attrs = [int("gen_ai.usage.input_tokens", 1_000), int("gen_ai.usage.output_tokens", 50)]
      const r = resolveTokens(attrs, "openai")
      expect(r.input).toBe(1_000)
      expect(r.cacheRead).toBe(0)
      expect(r.cacheCreate).toBe(0)
    })

    it("no reasoning → output unchanged", () => {
      const attrs = [int("gen_ai.usage.output_tokens", 200)]
      expect(resolveTokens(attrs, "openai").output).toBe(200)
    })

    it("reasoning zero → output unchanged", () => {
      const attrs = [int("gen_ai.usage.output_tokens", 200), int("gen_ai.usage.reasoning_tokens", 0)]
      expect(resolveTokens(attrs, "openai").output).toBe(200)
    })
  })

  // ═══════════════════════════════════════════════════════
  // CANDIDATE PRECEDENCE
  // ═══════════════════════════════════════════════════════

  describe("candidate precedence", () => {
    it("prefers gen_ai.usage.input_tokens over gen_ai.usage.prompt_tokens", () => {
      const attrs = [int("gen_ai.usage.input_tokens", 100), int("gen_ai.usage.prompt_tokens", 999)]
      expect(resolveTokens(attrs, "openai").input).toBe(100)
    })

    it("prefers gen_ai.usage.output_tokens over gen_ai.usage.completion_tokens", () => {
      const attrs = [int("gen_ai.usage.output_tokens", 200), int("gen_ai.usage.completion_tokens", 999)]
      expect(resolveTokens(attrs, "openai").output).toBe(200)
    })

    it("prefers ai.usage.cachedInputTokens over ai.usage.inputTokenDetails.cacheReadTokens", () => {
      const attrs = [
        int("ai.usage.inputTokens", 500),
        int("ai.usage.cachedInputTokens", 100),
        int("ai.usage.inputTokenDetails.cacheReadTokens", 999),
        int("ai.usage.inputTokenDetails.cacheWriteTokens", 50),
        int("ai.usage.outputTokens", 10),
      ]
      const r = resolveTokens(attrs, "openai")
      expect(r.cacheRead).toBe(100)
      expect(r.input).toBe(350) // 500 - 100 - 50
    })
  })

  // ═══════════════════════════════════════════════════════
  // ADDITIVE INVARIANT — the output contract must hold
  // across all conventions, providers, and strategies:
  //   total_input  = input + cacheRead + cacheCreate
  //   total_output = output + reasoning
  // ═══════════════════════════════════════════════════════

  describe("additive invariant across conventions", () => {
    const scenarios = [
      {
        name: "OTEL v1.37+ / OpenAI (inclusive input, inclusive output) — no total",
        provider: "openai",
        attrs: [
          int("gen_ai.usage.input_tokens", 10_000),
          int("gen_ai.usage.output_tokens", 200),
          int("gen_ai.usage.cache_read.input_tokens", 8_000),
          int("gen_ai.usage.cache_creation.input_tokens", 1_500),
          int("gen_ai.usage.reasoning_tokens", 60),
        ],
      },
      {
        name: "OpenInference / Anthropic (additive input, inclusive output) — no total",
        provider: "anthropic",
        attrs: [
          int("llm.token_count.prompt", 500),
          int("llm.token_count.completion", 200),
          int("llm.token_count.prompt_details.cache_read", 8_000),
          int("llm.token_count.prompt_details.cache_write", 1_500),
          int("llm.token_count.completion_details.reasoning", 60),
        ],
      },
      {
        name: "Vercel AI SDK v6+ (inclusive input, inclusive output) — with total",
        provider: "openai",
        attrs: [
          int("ai.usage.inputTokens", 10_000),
          int("ai.usage.outputTokens", 200),
          int("ai.usage.cachedInputTokens", 8_000),
          int("ai.usage.inputTokenDetails.cacheWriteTokens", 1_500),
          int("ai.usage.outputTokenDetails.reasoningTokens", 60),
          int("ai.usage.totalTokens", 10_200),
        ],
      },
      {
        name: "OpenInference / Anthropic (additive input) — with total proving additive",
        provider: "anthropic",
        attrs: [
          int("llm.token_count.prompt", 500),
          int("llm.token_count.completion", 200),
          int("llm.token_count.prompt_details.cache_read", 8_000),
          int("llm.token_count.prompt_details.cache_write", 1_500),
          int("llm.token_count.completion_details.reasoning", 60),
          int("llm.token_count.total", 10_200),
        ],
      },
      {
        name: "OTEL v1.37+ / Vertex AI (inclusive input, additive output) — no total",
        provider: "gcp.vertex_ai",
        attrs: [
          int("gen_ai.usage.input_tokens", 10_000),
          int("gen_ai.usage.output_tokens", 140),
          int("gen_ai.usage.cache_read.input_tokens", 8_000),
          int("gen_ai.usage.cache_creation.input_tokens", 1_500),
          int("gen_ai.usage.reasoning_tokens", 60),
        ],
      },
    ]

    it.each(scenarios)("$name", ({ provider, attrs }) => {
      const r = resolveTokens(attrs, provider)

      expect(r.input + r.cacheRead + r.cacheCreate).toBe(EXPECTED.totalInput)
      expect(r.output + r.reasoning).toBe(EXPECTED.totalOutput)
      expect(r.input).toBeGreaterThanOrEqual(0)
      expect(r.output).toBeGreaterThanOrEqual(0)
    })
  })

  // ═══════════════════════════════════════════════════════
  // EDGE CASES
  // ═══════════════════════════════════════════════════════

  describe("edge cases", () => {
    it("returns all zeros for empty attributes", () => {
      const r = resolveTokens([], "openai")
      expect(r.input).toBe(0)
      expect(r.output).toBe(0)
      expect(r.cacheRead).toBe(0)
      expect(r.cacheCreate).toBe(0)
      expect(r.reasoning).toBe(0)
    })

    it("clamps input at zero when cache exceeds raw (buggy instrumentation)", () => {
      const attrs = [int("gen_ai.usage.input_tokens", 50), int("gen_ai.usage.cache_read.input_tokens", 1_000)]
      expect(resolveTokens(attrs, "openai").input).toBe(0)
    })

    it("clamps output at zero when reasoning exceeds raw (buggy instrumentation)", () => {
      const attrs = [int("gen_ai.usage.output_tokens", 50), int("gen_ai.usage.reasoning_tokens", 200)]
      const r = resolveTokens(attrs, "openai")
      expect(r.output).toBe(0)
      expect(r.reasoning).toBe(200)
    })

    it("handles case-insensitive provider matching", () => {
      const attrs = [
        int("llm.token_count.prompt", 500),
        int("llm.token_count.prompt_details.cache_read", 8_000),
        int("llm.token_count.completion", 10),
      ]
      expect(resolveTokens(attrs, "ANTHROPIC").input).toBe(500)
      expect(resolveTokens(attrs, "Anthropic").input).toBe(500)
    })

    it("handles Vercel suffixed provider forms", () => {
      const attrs = [
        int("llm.token_count.prompt", 500),
        int("llm.token_count.prompt_details.cache_read", 8_000),
        int("llm.token_count.completion", 10),
      ]
      expect(resolveTokens(attrs, "anthropic.messages").input).toBe(500)
    })
  })

  // ═══════════════════════════════════════════════════════
  // REAL-WORLD PAYLOADS
  // ═══════════════════════════════════════════════════════

  describe("real-world payloads", () => {
    it("Vercel AI SDK v6 with OpenAI cache hit (total present)", () => {
      const attrs = [
        int("ai.usage.cachedInputTokens", 4429),
        int("ai.usage.inputTokenDetails.cacheReadTokens", 4429),
        int("ai.usage.inputTokenDetails.cacheWriteTokens", 4761),
        int("ai.usage.inputTokenDetails.noCacheTokens", 1),
        int("ai.usage.inputTokens", 9191),
        int("ai.usage.outputTokens", 93),
        int("ai.usage.totalTokens", 9284),
      ]
      const r = resolveTokens(attrs, "openai")

      expect(r.input).toBe(1)
      expect(r.cacheRead).toBe(4429)
      expect(r.cacheCreate).toBe(4761)
      expect(r.output).toBe(93)
      expect(r.input + r.cacheRead + r.cacheCreate).toBe(9191)
      expect(r.input + r.cacheRead + r.cacheCreate + r.output).toBe(9284)
    })

    it("OTEL v1.37+ OpenAI, no cache, no reasoning", () => {
      const attrs = [int("gen_ai.usage.input_tokens", 350), int("gen_ai.usage.output_tokens", 120)]
      const r = resolveTokens(attrs, "openai")

      expect(r.input).toBe(350)
      expect(r.output).toBe(120)
      expect(r.cacheRead).toBe(0)
      expect(r.cacheCreate).toBe(0)
      expect(r.reasoning).toBe(0)
    })

    it("OpenInference Anthropic with large cache read", () => {
      const attrs = [
        int("llm.token_count.prompt", 50),
        int("llm.token_count.completion", 10),
        int("llm.token_count.prompt_details.cache_read", 100_000),
        int("llm.token_count.prompt_details.cache_write", 0),
      ]
      const r = resolveTokens(attrs, "anthropic")

      expect(r.input).toBe(50)
      expect(r.cacheRead).toBe(100_000)
      expect(r.input + r.cacheRead + r.cacheCreate).toBe(100_050)
    })
  })
})
