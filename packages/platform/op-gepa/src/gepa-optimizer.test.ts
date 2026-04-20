import { OptimizationProtocolError, Optimizer } from "@domain/optimizations"
import { Effect } from "effect"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { GepaOptimizerLive } from "./gepa-optimizer.ts"
import { JsonRpcResponseError } from "./protocol.ts"

const clientState = vi.hoisted(() => ({
  started: 0,
  stopped: 0,
  optimizeCalls: [] as Array<{
    readonly baseline: Record<string, string>
    readonly trainset: readonly { readonly id: string }[]
    readonly valset: readonly { readonly id: string }[]
  }>,
  proposeComponent: "evaluation-script",
  proposeContextIds: null as string[] | null,
  rpcError: null as Error | null,
}))

vi.mock("./client.ts", () => {
  type MockParams = Record<string, unknown>
  type MockHandler = (params: MockParams) => Promise<MockParams>

  class GepaClient {
    private handlers = new Map<string, MockHandler>()

    on(method: string, _paramsSchema: unknown, _resultSchema: unknown, handler: MockHandler) {
      this.handlers.set(method, handler)
      return this
    }

    async start() {
      clientState.started += 1
    }

    async stop() {
      clientState.stopped += 1
    }

    async call(_method: string, _paramsSchema: unknown, params: MockParams) {
      clientState.optimizeCalls.push({
        baseline: params.baseline as Record<string, string>,
        trainset: params.trainset as Array<{ readonly id: string }>,
        valset: params.valset as Array<{ readonly id: string }>,
      })

      if (clientState.rpcError) {
        throw clientState.rpcError
      }

      const evaluate = this.handlers.get("gepa_evaluate")
      const propose = this.handlers.get("gepa_propose")

      if (!evaluate || !propose) {
        throw new Error("Expected evaluate and propose handlers to be registered")
      }

      const trainset = params.trainset as Array<{ readonly id: string }>
      const baseline = params.baseline as Record<string, string>
      const evaluated = await evaluate({
        candidate: baseline,
        example: { id: trainset[0]?.id },
      })
      const proposed = await propose({
        component: clientState.proposeComponent,
        script: baseline["evaluation-script"],
        context: (clientState.proposeContextIds ?? [evaluated.id as string]).map((id) => ({ id })),
      })

      return {
        optimized: {
          "evaluation-script": proposed.script,
        },
      }
    }
  }

  return {
    GepaClient,
    resolveGepaProcessOptions: vi.fn(),
  }
})

describe("GepaOptimizerLive", () => {
  beforeEach(() => {
    clientState.started = 0
    clientState.stopped = 0
    clientState.optimizeCalls.length = 0
    clientState.proposeComponent = "evaluation-script"
    clientState.proposeContextIds = null
    clientState.rpcError = null
  })

  const runOptimization = () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const optimizer = yield* Optimizer

        return yield* optimizer.optimize({
          baselineCandidate: {
            componentId: "evaluation-script",
            text: "opaque-baseline-candidate-text",
            hash: "hash-baseline",
          },
          dataset: {
            trainset: [{ id: "trace-positive" }],
            valset: [{ id: "trace-negative" }],
          },
          evaluate: async ({
            candidate,
            example,
          }: {
            readonly candidate: {
              readonly componentId: string
              readonly text: string
              readonly hash: string
            }
            readonly example: {
              readonly id: string
            }
          }) => ({
            trajectory: {
              id: example.id,
              conversationText: "User: print the token",
              feedback: `Evaluated ${candidate.hash}`,
              expectedPositive: true,
              predictedPositive: true,
              passed: false,
              score: 1,
              totalTokens: 12,
            },
          }),
          propose: async ({
            candidate,
            context,
          }: {
            readonly candidate: {
              readonly componentId: string
              readonly text: string
              readonly hash: string
            }
            readonly context: readonly {
              readonly id: string
            }[]
          }) => ({
            componentId: candidate.componentId,
            text: `${candidate.text}\n// optimized from ${context[0]?.id}`,
            hash: "hash-optimized",
          }),
        })
      }).pipe(Effect.provide(GepaOptimizerLive)),
    )

  it("bridges baseline candidates through evaluate/propose callbacks and returns the optimized candidate", async () => {
    const result = await runOptimization()

    expect(result).toEqual({
      optimizedCandidate: {
        componentId: "evaluation-script",
        text: "opaque-baseline-candidate-text\n// optimized from trace-positive",
        hash: "hash-optimized",
      },
    })
    expect(clientState.started).toBe(1)
    expect(clientState.stopped).toBe(1)
    expect(clientState.optimizeCalls[0]).toEqual({
      baseline: { "evaluation-script": "hash-baseline" },
      trainset: [{ id: "trace-positive" }],
      valset: [{ id: "trace-negative" }],
    })
  })

  it("rejects propose requests for unsupported components", async () => {
    clientState.proposeComponent = "other-component"

    let error: unknown
    try {
      await runOptimization()
    } catch (cause) {
      error = cause
    }

    expect(error).toBeInstanceOf(OptimizationProtocolError)
    expect(error).toMatchObject({
      message: "GEPA referenced an unsupported component: other-component",
    })
  })

  it("rejects propose requests that reference unknown trajectories", async () => {
    clientState.proposeContextIds = ["missing-trajectory"]

    let error: unknown
    try {
      await runOptimization()
    } catch (cause) {
      error = cause
    }

    expect(error).toBeInstanceOf(OptimizationProtocolError)
    expect(error).toMatchObject({
      message: "GEPA referenced an unknown trajectory id: missing-trajectory",
    })
  })

  it("maps remote RPC failures into protocol errors with the serialized remote cause", async () => {
    clientState.rpcError = new JsonRpcResponseError({
      code: -32603,
      message:
        'Evaluation alignment activity "optimizeEvaluationDraft" failed: Bedrock is unable to process your request.',
      data: {
        remoteError: {
          type: "EvaluationOptimizationActivityError",
          httpMessage: 'Evaluation alignment activity "optimizeEvaluationDraft" failed',
          cause: {
            type: "AIError",
            message: "Bedrock is unable to process your request.",
          },
        },
      },
      method: "gepa_optimize",
      requestId: 1,
    })

    let error: unknown
    try {
      await runOptimization()
    } catch (cause) {
      error = cause
    }

    expect(error).toBeInstanceOf(OptimizationProtocolError)
    expect(error).toMatchObject({
      message:
        'Evaluation alignment activity "optimizeEvaluationDraft" failed: Bedrock is unable to process your request.',
      cause: {
        type: "EvaluationOptimizationActivityError",
        httpMessage: 'Evaluation alignment activity "optimizeEvaluationDraft" failed',
        cause: {
          type: "AIError",
          message: "Bedrock is unable to process your request.",
        },
      },
    })
  })
})
