import {
  OptimizationAbortedError,
  type OptimizationCandidate,
  OptimizationProtocolError,
  type OptimizationTrajectory,
  OptimizationTransportError,
  Optimizer,
  type OptimizerShape,
} from "@domain/optimizations"
import { Effect, Layer } from "effect"
import { z } from "zod"
import { GepaClient } from "./client.ts"
import {
  GEPA_DEFAULT_REFLECTION_MINIBATCH_SIZE,
  GEPA_MAX_STAGNATION,
  GEPA_MAX_TIME,
  GEPA_MAX_TOKENS,
  GEPA_RPC_METHODS,
} from "./constants.ts"
import { JsonRpcResponseError } from "./protocol.ts"

const componentSchema = z.string().min(1)
const scriptSchema = z.string().min(1) // <script hash>
const systemSchema = z.record(componentSchema, scriptSchema)

const partialExampleSchema = z.object({
  id: z.string().min(1),
})

const partialTrajectorySchema = z.object({
  id: z.string().min(1),
})

const partialOutputSchema = z.object({
  id: z.string().min(1),
  score: z.number().min(0).max(1),
  expectedPositive: z.boolean(),
  predictedPositive: z.boolean(),
  totalTokens: z.number().int().nonnegative(),
})

const optimizeParamsSchema = z.object({
  baseline: systemSchema,
  trainset: z.array(partialExampleSchema),
  valset: z.array(partialExampleSchema),
  budget: z.object({
    time: z.number().int().positive().optional(),
    tokens: z.number().int().positive().optional(),
    stagnation: z.number().int().positive().optional(),
  }),
  reflectionMinibatchSize: z.number().int().positive(),
})

const stopReasonSchema = z.enum(["time_budget", "tokens_budget", "stagnation", "completed"])

const optimizeResultSchema = z.object({
  optimized: systemSchema,
  stopReason: stopReasonSchema,
})

const evaluateParamsSchema = z.object({
  candidate: systemSchema,
  example: partialExampleSchema,
})

const proposeParamsSchema = z.object({
  component: componentSchema,
  script: scriptSchema,
  context: z.array(partialTrajectorySchema),
})

const proposeResultSchema = z.object({
  script: scriptSchema,
})

const throwIfAborted = (abortSignal?: AbortSignal) => {
  if (abortSignal?.aborted) {
    throw new OptimizationAbortedError({})
  }
}

const resolveCandidate = (input: {
  readonly candidateByHash: ReadonlyMap<string, OptimizationCandidate>
  readonly system: Record<string, string>
  readonly componentId: string
}): OptimizationCandidate => {
  const hash = input.system[input.componentId]
  if (!hash) {
    throw new OptimizationProtocolError({
      message: `GEPA response did not include component ${input.componentId}`,
    })
  }

  const candidate = input.candidateByHash.get(hash)
  if (!candidate) {
    throw new OptimizationProtocolError({
      message: `GEPA referenced an unknown script hash: ${hash}`,
    })
  }

  return candidate
}

const resolveTrajectory = (input: {
  readonly trajectoryById: ReadonlyMap<string, OptimizationTrajectory>
  readonly trajectoryId: string
}): OptimizationTrajectory => {
  const trajectory = input.trajectoryById.get(input.trajectoryId)
  if (!trajectory) {
    throw new OptimizationProtocolError({
      message: `GEPA referenced an unknown trajectory id: ${input.trajectoryId}`,
    })
  }

  return trajectory
}

export const GepaOptimizerLive = Layer.succeed(Optimizer, {
  optimize: Effect.fn("optimizations.gepaOptimize")(function* (input) {
    yield* Effect.annotateCurrentSpan("optimization.componentId", input.baselineCandidate.componentId)
    yield* Effect.annotateCurrentSpan("optimization.trainsetSize", input.dataset.trainset.length)
    yield* Effect.annotateCurrentSpan("optimization.valsetSize", input.dataset.valset.length)

    throwIfAborted(input.abortSignal)

    const candidateByHash = new Map<string, OptimizationCandidate>([
      [input.baselineCandidate.hash, input.baselineCandidate],
    ])
    const trajectoryById = new Map<string, OptimizationTrajectory>()
    const client = new GepaClient(input.abortSignal ? { abortSignal: input.abortSignal } : {})

    client.on(GEPA_RPC_METHODS.evaluate, evaluateParamsSchema, partialOutputSchema, async (params) => {
      throwIfAborted(input.abortSignal)

      const candidate = resolveCandidate({
        candidateByHash,
        system: params.candidate,
        componentId: input.baselineCandidate.componentId,
      })

      const result = await input.evaluate(
        input.abortSignal
          ? {
              candidate,
              example: { id: params.example.id },
              abortSignal: input.abortSignal,
            }
          : {
              candidate,
              example: { id: params.example.id },
            },
      )

      trajectoryById.set(result.trajectory.id, result.trajectory)

      return {
        id: result.trajectory.id,
        score: result.trajectory.score,
        expectedPositive: result.trajectory.expectedPositive,
        predictedPositive: result.trajectory.predictedPositive,
        totalTokens: result.trajectory.totalTokens,
      }
    })

    client.on(GEPA_RPC_METHODS.propose, proposeParamsSchema, proposeResultSchema, async (params) => {
      throwIfAborted(input.abortSignal)

      if (params.component !== input.baselineCandidate.componentId) {
        throw new OptimizationProtocolError({
          message: `GEPA referenced an unsupported component: ${params.component}`,
        })
      }

      const currentCandidate = candidateByHash.get(params.script)
      if (!currentCandidate) {
        throw new OptimizationProtocolError({
          message: `GEPA referenced an unknown script: ${params.script}`,
        })
      }

      const context = params.context.map((trajectory: z.infer<typeof partialTrajectorySchema>) =>
        resolveTrajectory({
          trajectoryById,
          trajectoryId: trajectory.id,
        }),
      )

      const proposed = await input.propose(
        input.abortSignal
          ? {
              candidate: currentCandidate,
              context,
              abortSignal: input.abortSignal,
            }
          : {
              candidate: currentCandidate,
              context,
            },
      )

      candidateByHash.set(proposed.hash, proposed)

      return {
        script: proposed.hash,
      }
    })

    const stopClient = Effect.tryPromise({
      try: () => client.stop(),
      catch: (cause: unknown) =>
        new OptimizationTransportError({
          operation: "stop",
          cause,
        }),
    }).pipe(Effect.orDie)

    yield* Effect.tryPromise({
      try: () => client.start(),
      catch: (cause: unknown) =>
        new OptimizationTransportError({
          operation: "start",
          cause,
        }),
    })

    const result = yield* Effect.tryPromise({
      try: () =>
        client.call(
          GEPA_RPC_METHODS.optimize,
          optimizeParamsSchema,
          {
            baseline: {
              [input.baselineCandidate.componentId]: input.baselineCandidate.hash,
            },
            trainset: input.dataset.trainset.map((example) => ({ id: example.id })),
            valset: input.dataset.valset.map((example) => ({ id: example.id })),
            budget: {
              time: input.budget?.time ?? GEPA_MAX_TIME,
              tokens: input.budget?.tokens ?? GEPA_MAX_TOKENS,
              stagnation: input.budget?.stagnation ?? GEPA_MAX_STAGNATION,
            },
            reflectionMinibatchSize: input.reflectionMinibatchSize ?? GEPA_DEFAULT_REFLECTION_MINIBATCH_SIZE,
          },
          optimizeResultSchema,
        ),
      catch: (cause: unknown) =>
        cause instanceof OptimizationAbortedError || cause instanceof OptimizationProtocolError
          ? cause
          : cause instanceof JsonRpcResponseError
            ? new OptimizationProtocolError({
                message: cause.strippedMessage,
                cause: cause.remoteCause ?? cause,
              })
            : new OptimizationTransportError({
                operation: "optimize",
                cause,
              }),
    }).pipe(Effect.ensuring(stopClient))

    return {
      optimizedCandidate: resolveCandidate({
        candidateByHash,
        system: result.optimized,
        componentId: input.baselineCandidate.componentId,
      }),
      stopReason: result.stopReason,
    }
  }),
} satisfies OptimizerShape)
