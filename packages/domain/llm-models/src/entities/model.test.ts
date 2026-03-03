import { describe, expect, it } from "vitest"
import { parseModelsDevData } from "./model.ts"

describe("parseModelsDevData", () => {
  it("parses a single provider with one model", () => {
    const raw = {
      openai: {
        id: "openai",
        name: "OpenAI",
        models: {
          "gpt-4o": {
            id: "gpt-4o",
            name: "GPT-4o",
            tool_call: true,
            reasoning: false,
            structured_output: true,
            temperature: true,
            knowledge: "2024-06-01",
            release_date: "2024-05-13",
            modalities: {
              input: ["text", "image"] as const,
              output: ["text"] as const,
            },
            cost: { input: 2.5, output: 10 },
            limit: { context: 128000, output: 16384 },
          },
        },
      },
    }

    const models = parseModelsDevData(raw)

    expect(models).toHaveLength(1)
    const model = models[0]
    expect(model.id).toBe("gpt-4o")
    expect(model.name).toBe("GPT-4o")
    expect(model.provider).toBe("openai")
    expect(model.toolCall).toBe(true)
    expect(model.reasoning).toBe(false)
    expect(model.structuredOutput).toBe(true)
    expect(model.supportsTemperature).toBe(true)
    expect(model.knowledgeCutoff).toBe("2024-06-01")
    expect(model.releaseDate).toBe("2024-05-13")
    expect(model.contextLimit).toBe(128000)
    expect(model.outputLimit).toBe(16384)
    expect(model.pricing).toEqual({ input: 2.5, output: 10 })
    expect(model.modalities).toEqual({
      input: ["text", "image"],
      output: ["text"],
    })
  })

  it("parses multiple providers with multiple models", () => {
    const raw = {
      openai: {
        id: "openai",
        name: "OpenAI",
        models: {
          "gpt-4o": { id: "gpt-4o", name: "GPT-4o", cost: { input: 2.5, output: 10 } },
          "gpt-4o-mini": { id: "gpt-4o-mini", name: "GPT-4o Mini", cost: { input: 0.15, output: 0.6 } },
        },
      },
      anthropic: {
        id: "anthropic",
        name: "Anthropic",
        models: {
          "claude-sonnet-4-20250514": {
            id: "claude-sonnet-4-20250514",
            name: "Claude Sonnet 4",
            cost: { input: 3, output: 15 },
          },
        },
      },
    }

    const models = parseModelsDevData(raw)
    expect(models).toHaveLength(3)
    expect(models.map((m) => m.provider)).toEqual(["openai", "openai", "anthropic"])
  })

  it("skips providers with no models", () => {
    const raw = {
      empty: { id: "empty", name: "Empty Provider" },
    }

    const models = parseModelsDevData(raw)
    expect(models).toHaveLength(0)
  })

  it("handles models without cost data", () => {
    const raw = {
      test: {
        id: "test",
        name: "Test",
        models: {
          "no-cost": { id: "no-cost", name: "No Cost Model" },
        },
      },
    }

    const models = parseModelsDevData(raw)
    expect(models).toHaveLength(1)
    expect(models[0]?.pricing).toBeUndefined()
  })

  it("handles cost with cache_read and reasoning", () => {
    const raw = {
      test: {
        id: "test",
        name: "Test",
        models: {
          m: {
            id: "m",
            name: "M",
            cost: { input: 1, output: 5, cache_read: 0.5, reasoning: 3 },
          },
        },
      },
    }

    const models = parseModelsDevData(raw)
    expect(models[0]?.pricing).toEqual({
      input: 1,
      output: 5,
      cacheRead: 0.5,
      reasoning: 3,
    })
  })

  it("returns empty array for empty input", () => {
    expect(parseModelsDevData({})).toEqual([])
  })
})
