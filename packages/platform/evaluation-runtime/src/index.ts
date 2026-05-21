import { createRequire } from "node:module"
import { Worker } from "node:worker_threads"
import { AI, type AICredentialError, type AIError, type GenerateResult } from "@domain/ai"
import {
  EVALUATION_SCRIPT_RUNTIME_MODEL,
  EVALUATION_SCRIPT_RUNTIME_SYSTEM_PROMPT,
  EvaluationExecutionError,
  type EvaluationJsonSchema,
  type EvaluationScriptExecution,
  EvaluationScriptRuntime,
  type ExecuteEvaluationScriptRuntimeInput,
  estimateEvaluationScriptCostMicrocents,
  evaluationExecutionResultPayloadSchema,
  evaluationJsonSchemaSchema,
  jsonSchemaToZod,
} from "@domain/evaluations"
import { Effect, Layer } from "effect"
import { sandboxWorkerSource } from "./sandbox-worker.ts"

const requireFromModule = createRequire(import.meta.url)
const JSON_SCHEMA_VALIDATOR_PATH = requireFromModule.resolve("@cfworker/json-schema")

const DEFAULT_WALL_TIMEOUT_MS = 15_000
const DEFAULT_SYNC_TIMEOUT_MS = 1_000
const DEFAULT_MAX_OLD_GENERATION_SIZE_MB = 64
const DEFAULT_MAX_LLM_CALLS = 8
// Short-term production bulkhead for the shared workers allocation: workers get
// 1 vCPU and 2GB app memory, so only a small number of sandbox workers should
// execute at once. Queue-level concurrency can be higher because many scripts
// spend most wall time waiting on the host-controlled llm() bridge.
const DEFAULT_MAX_CONCURRENT_SANDBOXES = 2

class SandboxSemaphore {
  private active = 0
  private readonly waiters: Array<() => void> = []

  constructor(private readonly limit: number) {}

  acquire(): Promise<() => void> {
    if (this.active < this.limit) {
      this.active += 1
      return Promise.resolve(() => this.release())
    }

    return new Promise((resolve) => {
      this.waiters.push(() => {
        this.active += 1
        resolve(() => this.release())
      })
    })
  }

  private release() {
    this.active -= 1
    const next = this.waiters.shift()
    if (next) next()
  }
}

const sandboxSemaphore = new SandboxSemaphore(DEFAULT_MAX_CONCURRENT_SANDBOXES)

interface RuntimeRequestMessage {
  readonly type: "request"
  readonly id: number
  readonly method: "llm"
  readonly payload: {
    readonly prompt: string
    readonly schema: unknown
    readonly temperature?: number
    readonly maxTokens?: number
  }
}

interface RuntimeResultMessage {
  readonly type: "result"
  readonly result: unknown
}

interface RuntimeErrorMessage {
  readonly type: "error"
  readonly error: string
}

type RuntimeMessage = RuntimeRequestMessage | RuntimeResultMessage | RuntimeErrorMessage

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null

const toPlainJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const isRuntimeMessage = (message: unknown): message is RuntimeMessage =>
  isRecord(message) && typeof message.type === "string"

const toRuntimeError = (cause: unknown) =>
  cause instanceof EvaluationExecutionError
    ? cause
    : new EvaluationExecutionError({
        message: cause instanceof Error ? cause.message : "Evaluation script execution failed",
        cause,
      })

const parseOptionalSchema = (schema: unknown): EvaluationJsonSchema | undefined => {
  if (schema === null || schema === undefined) return undefined
  return evaluationJsonSchemaSchema.parse(schema)
}

const runSandbox = (input: {
  readonly execution: ExecuteEvaluationScriptRuntimeInput
  readonly generate: <T>(params: {
    readonly prompt: string
    readonly schema: EvaluationJsonSchema | undefined
    readonly temperature?: number
    readonly maxTokens?: number
  }) => Promise<GenerateResult<T>>
}): Promise<EvaluationScriptExecution> =>
  new Promise((resolve, reject) => {
    const worker = new Worker(sandboxWorkerSource, {
      eval: true,
      resourceLimits: {
        maxOldGenerationSizeMb: DEFAULT_MAX_OLD_GENERATION_SIZE_MB,
      },
      workerData: toPlainJson({
        script: input.execution.script,
        conversation: input.execution.conversation,
        metadata: input.execution.metadata,
        issue: input.execution.issue,
        jsonSchemaValidatorPath: JSON_SCHEMA_VALIDATOR_PATH,
        syncTimeoutMs: DEFAULT_SYNC_TIMEOUT_MS,
      }),
    })

    let settled = false
    let llmCalls = 0
    let totalTokens = 0
    let totalDurationNs = 0
    let totalCostMicrocents = 0

    const settle = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      void worker.terminate()
      fn()
    }

    const timer = setTimeout(() => {
      settle(() =>
        reject(
          new EvaluationExecutionError({
            message: `Evaluation script exceeded ${DEFAULT_WALL_TIMEOUT_MS}ms runtime limit`,
          }),
        ),
      )
    }, DEFAULT_WALL_TIMEOUT_MS)

    worker.on("message", (rawMessage: unknown) => {
      if (!isRuntimeMessage(rawMessage)) return

      if (rawMessage.type === "result") {
        const result = evaluationExecutionResultPayloadSchema.parse(rawMessage.result)
        settle(() =>
          resolve({
            result,
            totalTokens,
            totalDurationNs,
            totalCostMicrocents,
          }),
        )
        return
      }

      if (rawMessage.type === "error") {
        settle(() => reject(new EvaluationExecutionError({ message: rawMessage.error })))
        return
      }

      if (rawMessage.type === "request") {
        if (rawMessage.method !== "llm") return
        llmCalls += 1
        if (llmCalls > DEFAULT_MAX_LLM_CALLS) {
          worker.postMessage(
            toPlainJson({
              type: "response",
              id: rawMessage.id,
              ok: false,
              error: `Evaluation script exceeded ${DEFAULT_MAX_LLM_CALLS} llm() calls`,
            }),
          )
          return
        }

        Promise.resolve()
          .then(async () => {
            const schema = parseOptionalSchema(rawMessage.payload.schema)
            const result = await input.generate({
              prompt: rawMessage.payload.prompt,
              schema,
              ...(rawMessage.payload.temperature !== undefined ? { temperature: rawMessage.payload.temperature } : {}),
              ...(rawMessage.payload.maxTokens !== undefined ? { maxTokens: rawMessage.payload.maxTokens } : {}),
            })
            totalTokens += result.tokens
            totalDurationNs += result.duration
            totalCostMicrocents += estimateEvaluationScriptCostMicrocents(result)
            worker.postMessage(toPlainJson({ type: "response", id: rawMessage.id, ok: true, value: result.object }))
          })
          .catch((error: unknown) => {
            worker.postMessage(
              toPlainJson({
                type: "response",
                id: rawMessage.id,
                ok: false,
                error: error instanceof Error ? error.message : String(error),
              }),
            )
          })
      }
    })

    worker.on("error", (error) => {
      settle(() => reject(toRuntimeError(error)))
    })

    worker.on("exit", (code) => {
      if (!settled && code !== 0) {
        settle(() =>
          reject(new EvaluationExecutionError({ message: `Evaluation script worker exited with code ${code}` })),
        )
      }
    })
  })

export const EvaluationScriptRuntimeLive = Layer.effect(
  EvaluationScriptRuntime,
  Effect.gen(function* () {
    const ai = yield* AI
    const services = yield* Effect.context<never>()

    return {
      compile: (script) =>
        Effect.try({
          try: () => {
            if (script.trim().length === 0) throw new Error("Evaluation script cannot be empty")
          },
          catch: toRuntimeError,
        }),
      execute: (input) =>
        Effect.tryPromise({
          try: async () => {
            const releaseSandbox = await sandboxSemaphore.acquire()
            try {
              return await runSandbox({
                execution: input,
                generate: <T>(params: {
                  readonly prompt: string
                  readonly schema: EvaluationJsonSchema | undefined
                  readonly temperature?: number
                  readonly maxTokens?: number
                }) => {
                  const schema = params.schema ? jsonSchemaToZod(params.schema) : jsonSchemaToZod({ type: "string" })
                  return Effect.runPromiseWith(services)(
                    ai.generate({
                      ...EVALUATION_SCRIPT_RUNTIME_MODEL,
                      system: EVALUATION_SCRIPT_RUNTIME_SYSTEM_PROMPT,
                      prompt: params.prompt,
                      schema,
                      ...(params.temperature !== undefined ? { temperature: params.temperature } : {}),
                      ...(params.maxTokens !== undefined ? { maxTokens: params.maxTokens } : {}),
                      ...(input.telemetry ? { telemetry: input.telemetry } : {}),
                    }) as Effect.Effect<GenerateResult<T>, AIError | AICredentialError>,
                  )
                },
              })
            } finally {
              releaseSandbox()
            }
          },
          catch: toRuntimeError,
        }),
    }
  }),
)
