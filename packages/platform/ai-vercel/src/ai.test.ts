import { AICredentialError, AIGenerate, EMBEDDING_DIMENSIONS } from "@domain/ai"
import { Effect, Result } from "effect"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const {
  bedrockModelFactoryMock,
  createAmazonBedrockMock,
  embedMock,
  fromNodeProviderChainMock,
  generateTextMock,
  outputObjectMock,
  rerankMock,
} = vi.hoisted(() => {
  const bedrockModelFactoryMock = Object.assign(
    vi.fn((modelId: string) => ({ modelId })),
    {
      reranking: vi.fn((modelId: string) => ({ modelId })),
    },
  )

  return {
    bedrockModelFactoryMock,
    createAmazonBedrockMock: vi.fn(() => bedrockModelFactoryMock),
    embedMock: vi.fn(),
    fromNodeProviderChainMock: vi.fn(() =>
      Promise.resolve({
        accessKeyId: "provider-chain-access-key",
        secretAccessKey: "provider-chain-secret-key",
      }),
    ),
    generateTextMock: vi.fn(),
    outputObjectMock: vi.fn((value: unknown) => value),
    rerankMock: vi.fn(),
  }
})

vi.mock("@ai-sdk/amazon-bedrock", () => ({
  createAmazonBedrock: createAmazonBedrockMock,
}))

vi.mock("@aws-sdk/credential-providers", () => ({
  fromNodeProviderChain: fromNodeProviderChainMock,
}))

vi.mock("ai", () => ({
  embed: embedMock,
  generateText: generateTextMock,
  Output: {
    object: outputObjectMock,
  },
  rerank: rerankMock,
  tool: (definition: unknown) => definition,
  stepCountIs: (count: number) => ({ stepCountIs: count }),
  jsonSchema: (schema: unknown) => ({ jsonSchema: schema }),
}))

import { AIAgent, type RunAgentInput } from "@domain/ai"
import { z } from "zod"
import {
  AIAgentLive,
  AIGenerateLive,
  createProviderModel,
  embedWithVercel,
  loosenSchemaForBedrock,
  rerankWithVercel,
} from "./ai.ts"

const originalAwsRegion = process.env.LAT_AWS_REGION
const originalAwsAccessKeyId = process.env.LAT_AWS_ACCESS_KEY_ID
const originalAwsSecretAccessKey = process.env.LAT_AWS_SECRET_ACCESS_KEY
const originalAwsSessionToken = process.env.LAT_AWS_SESSION_TOKEN
const originalAwsBearerTokenBedrock = process.env.LAT_AWS_BEARER_TOKEN_BEDROCK
// Local dev shells may carry real provider keys; scrubbed per test so the
// credential-missing assertions stay deterministic.
const originalOpenAiApiKey = process.env.LAT_OPENAI_API_KEY
const originalGoogleApiKey = process.env.LAT_GOOGLE_API_KEY
const originalCustomAiBaseUrl = process.env.LAT_CUSTOM_AI_BASE_URL

beforeEach(() => {
  process.env.LAT_AWS_REGION = "eu-central-1"
  process.env.LAT_AWS_ACCESS_KEY_ID = "test-access-key"
  process.env.LAT_AWS_SECRET_ACCESS_KEY = "test-secret-key"
  delete process.env.LAT_AWS_SESSION_TOKEN
  delete process.env.LAT_AWS_BEARER_TOKEN_BEDROCK
  bedrockModelFactoryMock.mockClear()
  createAmazonBedrockMock.mockClear()
  fromNodeProviderChainMock.mockClear()
  generateTextMock.mockReset()
  outputObjectMock.mockClear()
  delete process.env.LAT_OPENAI_API_KEY
  delete process.env.LAT_GOOGLE_API_KEY
  delete process.env.LAT_CUSTOM_AI_BASE_URL
  embedMock.mockReset()
  rerankMock.mockReset()
})

afterEach(() => {
  process.env.LAT_AWS_REGION = originalAwsRegion
  process.env.LAT_AWS_ACCESS_KEY_ID = originalAwsAccessKeyId
  process.env.LAT_AWS_SECRET_ACCESS_KEY = originalAwsSecretAccessKey
  process.env.LAT_AWS_SESSION_TOKEN = originalAwsSessionToken
  process.env.LAT_AWS_BEARER_TOKEN_BEDROCK = originalAwsBearerTokenBedrock
  process.env.LAT_OPENAI_API_KEY = originalOpenAiApiKey
  process.env.LAT_GOOGLE_API_KEY = originalGoogleApiKey
  process.env.LAT_CUSTOM_AI_BASE_URL = originalCustomAiBaseUrl
})

describe("createProviderModel", () => {
  it("fails with AICredentialError on the Effect channel for unsupported providers", async () => {
    const outcome = await Effect.runPromise(
      Effect.result(createProviderModel("unknown-provider", "anthropic.claude-sonnet-4-20250514-v1:0")),
    )

    expect(Result.isFailure(outcome)).toBe(true)
    if (Result.isFailure(outcome)) {
      expect(outcome.failure).toBeInstanceOf(AICredentialError)
      expect(outcome.failure.provider).toBe("unknown-provider")
      expect(outcome.failure.statusCode).toBe(400)
    }
  })

  it("succeeds with a language model for Bedrock", async () => {
    const model = await Effect.runPromise(
      createProviderModel("amazon-bedrock", "anthropic.claude-sonnet-4-20250514-v1:0"),
    )

    expect(model).toBeDefined()
    expect(typeof model).toBe("object")
    expect(createAmazonBedrockMock).toHaveBeenCalledTimes(1)
    expect(bedrockModelFactoryMock).toHaveBeenCalledWith("eu.anthropic.claude-sonnet-4-20250514-v1:0")
    expect(fromNodeProviderChainMock).not.toHaveBeenCalled()
  })

  it("uses the AWS SDK credential provider chain for Bedrock when explicit credentials are absent", async () => {
    delete process.env.LAT_AWS_ACCESS_KEY_ID
    delete process.env.LAT_AWS_SECRET_ACCESS_KEY
    delete process.env.LAT_AWS_SESSION_TOKEN

    const model = await Effect.runPromise(
      createProviderModel("amazon-bedrock", "anthropic.claude-sonnet-4-20250514-v1:0"),
    )

    expect(model).toBeDefined()
    expect(typeof model).toBe("object")
    expect(bedrockModelFactoryMock).toHaveBeenCalledWith("eu.anthropic.claude-sonnet-4-20250514-v1:0")
    expect(fromNodeProviderChainMock).toHaveBeenCalledTimes(1)
  })

  it("rewrites already-scoped Bedrock model IDs to the configured AWS geography", async () => {
    process.env.LAT_AWS_REGION = "eu-central-1"

    await Effect.runPromise(createProviderModel("amazon-bedrock", "us.amazon.nova-2-lite-v1:0"))

    expect(bedrockModelFactoryMock).toHaveBeenCalledWith("eu.amazon.nova-2-lite-v1:0")
  })

  it("preserves global Bedrock model IDs", async () => {
    await Effect.runPromise(createProviderModel("amazon-bedrock", "global.anthropic.claude-sonnet-4-20250514-v1:0"))

    expect(bedrockModelFactoryMock).toHaveBeenCalledWith("global.anthropic.claude-sonnet-4-20250514-v1:0")
  })

  it("passes foundation-only Bedrock model IDs through without a geography prefix", async () => {
    // MiniMax on Bedrock ships as a raw foundation model; wrapping it with
    // `us.`, `eu.`, or `apac.` yields an identifier AWS rejects.
    await Effect.runPromise(createProviderModel("amazon-bedrock", "minimax.minimax-m2.5"))

    expect(bedrockModelFactoryMock).toHaveBeenCalledWith("minimax.minimax-m2.5")
  })

  it("strips a bogus geography prefix from foundation-only Bedrock model IDs", async () => {
    await Effect.runPromise(createProviderModel("amazon-bedrock", "us.minimax.minimax-m2.5"))

    expect(bedrockModelFactoryMock).toHaveBeenCalledWith("minimax.minimax-m2.5")
  })

  it("passes GPT OSS 120B through as an on-demand foundation model", async () => {
    process.env.LAT_AWS_REGION = "eu-central-1"

    await Effect.runPromise(createProviderModel("amazon-bedrock", "openai.gpt-oss-120b-1:0"))

    expect(bedrockModelFactoryMock).toHaveBeenCalledWith("openai.gpt-oss-120b-1:0")
  })

  it("strips a bogus geography prefix from GPT OSS 120B", async () => {
    process.env.LAT_AWS_REGION = "eu-central-1"

    await Effect.runPromise(createProviderModel("amazon-bedrock", "eu.openai.gpt-oss-120b-1:0"))

    expect(bedrockModelFactoryMock).toHaveBeenCalledWith("openai.gpt-oss-120b-1:0")
  })
})

describe("AIGenerateLive", () => {
  it("falls back from MiniMax M2.5 to GPT OSS 120B", async () => {
    generateTextMock
      .mockRejectedValueOnce(new Error("Bedrock is unable to process your request."))
      .mockResolvedValueOnce({
        output: { ok: true },
        usage: {
          totalTokens: 3,
          inputTokens: 2,
          outputTokens: 1,
        },
      })

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const ai = yield* AIGenerate

        return yield* ai.generate({
          provider: "amazon-bedrock",
          model: "minimax.minimax-m2.5",
          system: "Return JSON.",
          prompt: "Say ok.",
          schema: { parse: (value: unknown) => value } as never,
        })
      }).pipe(Effect.provide(AIGenerateLive)),
    )

    expect(result.object).toEqual({ ok: true })
    expect(generateTextMock).toHaveBeenCalledTimes(2)
    expect(generateTextMock.mock.calls[0]?.[0].model).toEqual({ modelId: "minimax.minimax-m2.5" })
    expect(generateTextMock.mock.calls[1]?.[0].model).toEqual({ modelId: "openai.gpt-oss-120b-1:0" })
  })
})

const EMBED_INPUT = {
  text: "hello",
  provider: "openai",
  model: "text-embedding-3-large",
} as const

const vectorOf = (entries: Record<number, number>): number[] => {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0)
  for (const [index, value] of Object.entries(entries)) {
    vector[Number(index)] = value
  }
  return vector
}

describe("embedWithVercel", () => {
  it("fails with a clear error for an unsupported provider", async () => {
    await expect(
      Effect.runPromise(embedWithVercel({ ...EMBED_INPUT, provider: "amazon-bedrock" })),
    ).rejects.toMatchObject({
      _tag: "AIError",
      message: expect.stringContaining('Unsupported embedding provider "amazon-bedrock"'),
    })
  })

  it("fails per call when the provider credentials are missing", async () => {
    await expect(Effect.runPromise(embedWithVercel(EMBED_INPUT))).rejects.toMatchObject({
      _tag: "AIError",
      message: "OpenAI is unavailable: set LAT_OPENAI_API_KEY.",
    })

    await expect(Effect.runPromise(embedWithVercel({ ...EMBED_INPUT, provider: "google" }))).rejects.toMatchObject({
      _tag: "AIError",
      message: "Google is unavailable: set LAT_GOOGLE_API_KEY.",
    })

    await expect(Effect.runPromise(embedWithVercel({ ...EMBED_INPUT, provider: "custom" }))).rejects.toMatchObject({
      _tag: "AIError",
      message: "The custom AI provider is unavailable: set LAT_CUSTOM_AI_BASE_URL.",
    })
  })

  it("rejects vectors whose dimensionality differs from the fixed 2048", async () => {
    process.env.LAT_OPENAI_API_KEY = "test-key"
    embedMock.mockResolvedValue({ embedding: [1, 2, 3] })

    await expect(Effect.runPromise(embedWithVercel(EMBED_INPUT))).rejects.toMatchObject({
      _tag: "AIError",
      message: expect.stringContaining("returned 3-dimensional vectors"),
    })
  })

  it("L2-normalizes returned vectors", async () => {
    process.env.LAT_OPENAI_API_KEY = "test-key"
    embedMock.mockResolvedValue({ embedding: vectorOf({ 0: 3, 2: 4 }) })

    const result = await Effect.runPromise(embedWithVercel(EMBED_INPUT))

    expect(result.embedding).toEqual(vectorOf({ 0: 0.6, 2: 0.8 }))
    expect(embedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        value: "hello",
        providerOptions: { openai: { dimensions: EMBEDDING_DIMENSIONS } },
      }),
    )
  })

  it("maps the dimension and input type to Google provider options", async () => {
    process.env.LAT_GOOGLE_API_KEY = "test-key"
    embedMock.mockResolvedValue({ embedding: vectorOf({ 1: 1 }) })

    await Effect.runPromise(
      embedWithVercel({ ...EMBED_INPUT, provider: "google", model: "gemini-embedding-001", inputType: "query" }),
    )

    expect(embedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        providerOptions: { google: { outputDimensionality: EMBEDDING_DIMENSIONS, taskType: "RETRIEVAL_QUERY" } },
      }),
    )
  })
})

describe("rerankWithVercel", () => {
  it("fails with a clear error for an unsupported provider", async () => {
    await expect(
      Effect.runPromise(rerankWithVercel({ query: "q", documents: ["a"], provider: "openai", model: "gpt-rank" })),
    ).rejects.toMatchObject({
      _tag: "AIError",
      message: expect.stringContaining('Unsupported reranking provider "openai"'),
    })
  })

  it("maps the AI SDK ranking shape to RerankResult", async () => {
    rerankMock.mockResolvedValue({
      ranking: [
        { originalIndex: 2, score: 0.9, document: "c" },
        { originalIndex: 0, score: 0.4, document: "a" },
      ],
    })

    const results = await Effect.runPromise(
      rerankWithVercel({
        query: "q",
        documents: ["a", "b", "c"],
        provider: "amazon-bedrock",
        model: "cohere.rerank-v3-5:0",
      }),
    )

    expect(results).toEqual([
      { index: 2, relevanceScore: 0.9 },
      { index: 0, relevanceScore: 0.4 },
    ])
  })
})

const runAgentEffect = (input: RunAgentInput) =>
  Effect.gen(function* () {
    const agent = yield* AIAgent
    return yield* agent.runAgent(input)
  }).pipe(Effect.provide(AIAgentLive))

describe("AIAgentLive.runAgent", () => {
  const baseInput = {
    provider: "amazon-bedrock",
    model: "anthropic.claude-sonnet-4-6",
    system: "You are a research agent.",
    prompt: "Investigate the project.",
    tools: [],
    maxSteps: 5,
  }

  it("fires onStep per provider step, executes tools, and bounds the loop with stepCountIs", async () => {
    const execute = vi.fn(async (input: unknown) => ({ echoed: input }))
    let capturedTools: Record<string, { execute: (input: unknown) => unknown }> = {}
    let capturedStopWhen: unknown

    generateTextMock.mockImplementation(async (call: Record<string, unknown>) => {
      capturedTools = call.tools as typeof capturedTools
      capturedStopWhen = call.stopWhen
      const onStepFinish = call.onStepFinish as (step: unknown) => void
      // The adapter awaits the tool `execute`, so mimic the SDK invoking it.
      await capturedTools.research?.execute({ projectSlug: "acme" })
      onStepFinish({
        text: "Investigating the ticket_cancellation tool",
        toolCalls: [{ toolName: "research", input: { projectSlug: "acme" } }],
        finishReason: "tool-calls",
        usage: { inputTokens: 10, outputTokens: 5 },
      })
      onStepFinish({
        text: "Creating the signal",
        toolCalls: [],
        finishReason: "stop",
        usage: { inputTokens: 3, outputTokens: 2 },
      })
      return {
        text: "Done",
        totalUsage: { inputTokens: 13, outputTokens: 7 },
        finishReason: "stop",
        response: { messages: [] },
      }
    })

    const steps: Array<{ text?: string }> = []
    const result = await Effect.runPromise(
      runAgentEffect({
        ...baseInput,
        maxSteps: 9,
        tools: [
          {
            name: "research",
            description: "Research the project",
            inputSchema: z.object({ projectSlug: z.string() }),
            execute,
          },
        ],
        onStep: (step) => steps.push(step),
      }),
    )

    expect(execute).toHaveBeenCalledWith({ projectSlug: "acme" })
    expect(steps.map((s) => s.text)).toEqual(["Investigating the ticket_cancellation tool", "Creating the signal"])
    expect(result.steps).toHaveLength(2)
    expect(result.text).toBe("Done")
    expect(result.tokenUsage).toEqual({ input: 13, output: 7 })
    expect(result.finishReason).toBe("stop")
    expect(capturedStopWhen).toEqual({ stepCountIs: 9 })
  })

  it("passes active tool controls to the provider loop", async () => {
    let capturedActiveTools: unknown
    let capturedPrepareStep: ((input: { stepNumber: number }) => Promise<unknown>) | undefined

    generateTextMock.mockImplementation(async (call: Record<string, unknown>) => {
      capturedActiveTools = call.activeTools
      capturedPrepareStep = call.prepareStep as typeof capturedPrepareStep
      return {
        text: "Done",
        totalUsage: { inputTokens: 1, outputTokens: 1 },
        finishReason: "stop",
        response: { messages: [] },
      }
    })

    await Effect.runPromise(
      runAgentEffect({
        ...baseInput,
        activeTools: ["searchTools"],
        prepareStep: ({ stepNumber }) => ({
          activeTools: stepNumber === 0 ? ["searchTools"] : ["searchTools", "listSignals"],
        }),
      }),
    )

    expect(capturedActiveTools).toEqual(["searchTools"])
    await expect(capturedPrepareStep?.({ stepNumber: 2 })).resolves.toEqual({
      activeTools: ["searchTools", "listSignals"],
    })
  })

  it("maps provider failures to AIError on the Effect channel", async () => {
    generateTextMock.mockImplementation(async () => {
      throw new Error("bedrock exploded")
    })

    const outcome = await Effect.runPromise(Effect.result(runAgentEffect(baseInput)))

    expect(Result.isFailure(outcome)).toBe(true)
    if (Result.isFailure(outcome)) {
      expect(outcome.failure.message).toContain("AI agent run failed")
      expect(outcome.failure.message).toContain("bedrock exploded")
    }
  })
})

describe("loosenSchemaForBedrock", () => {
  it("strips numeric/array constraint keywords Bedrock rejects", () => {
    const schema = z.object({
      limit: z.number().int().min(1).max(50),
      names: z.array(z.string()).max(10),
    })

    const loosened = loosenSchemaForBedrock(schema) as unknown as { jsonSchema: Record<string, unknown> }
    const serialized = JSON.stringify(loosened.jsonSchema)

    expect(serialized).not.toContain("minimum")
    expect(serialized).not.toContain("maximum")
    expect(serialized).not.toContain("maxItems")
  })
})
