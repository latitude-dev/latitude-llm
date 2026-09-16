import {
  JevShadowDecisionProvider,
  type JevShadowDecisionProviderRequest,
  type JevShadowDecisionProviderShape,
  type JevShadowProviderFailureKind,
  type JevShadowProviderResult,
  jevShadowProviderResultSchema,
} from "@domain/flaggers"
import { parseEnvOptional } from "@platform/env"
import { Effect, Layer } from "effect"
import { z } from "zod"

export const DEFAULT_JEV_BASE_URL = "https://api.typesafe.ai"
export const DEFAULT_JEV_MODEL = "jev-latest"
export const DEFAULT_JEV_TIMEOUT_MS = 2_000
export const MAX_JEV_TIMEOUT_MS = 2_000

const provider = "typesafe-ai"

const noulAnswerSchema = z.object({
  type: z.literal("noul"),
  noul: z.number().finite().min(0).max(1),
})

const systemOneResponseSchema = z.object({
  answers: z.record(z.string(), noulAnswerSchema),
  usage: z.object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
  }),
  model: z.string().min(1),
})

export interface JevShadowDecisionProviderClientOptions {
  readonly apiKey: string
  readonly baseUrl?: string | undefined
  readonly model?: string | undefined
  readonly timeoutMs?: number | undefined
  readonly fetch?: typeof fetch | undefined
}

const responseCategory = (status: number): JevShadowProviderFailureKind => {
  if (status === 401 || status === 403) return "authentication"
  if (status === 429) return "rate-limit"
  return "provider"
}

const requestUrl = (baseUrl: string) => `${baseUrl.replace(/\/+$/, "")}/v1/systemone`

const isValidTimeout = (timeoutMs: number): boolean =>
  Number.isFinite(timeoutMs) && Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= MAX_JEV_TIMEOUT_MS

const networkFailureCategory = (timeoutSignal: AbortSignal): JevShadowProviderFailureKind =>
  timeoutSignal.aborted ? "timeout" : "provider"

const bodyReadFailureCategory = (timeoutSignal: AbortSignal): JevShadowProviderFailureKind =>
  timeoutSignal.aborted ? "timeout" : "malformed-response"

const failure = (args: {
  readonly errorCategory: JevShadowProviderFailureKind
  readonly requestedModel: string
  readonly startedAt: number
}): JevShadowProviderResult =>
  jevShadowProviderResultSchema.parse({
    kind: "failure",
    errorCategory: args.errorCategory,
    provider,
    requestedModel: args.requestedModel,
    resolvedModel: null,
    latencyMs: Math.max(0, Math.round(Date.now() - args.startedAt)),
    inputTokens: null,
    outputTokens: null,
  })

const parseSuccessResponse = (args: {
  readonly body: unknown
  readonly questionId: string
  readonly requestedModel: string
  readonly startedAt: number
}): JevShadowProviderResult => {
  const parsed = systemOneResponseSchema.safeParse(args.body)
  const answer = parsed.success ? parsed.data.answers[args.questionId] : undefined

  if (answer === undefined || !parsed.success) {
    return failure({
      errorCategory: "malformed-response",
      requestedModel: args.requestedModel,
      startedAt: args.startedAt,
    })
  }

  return jevShadowProviderResultSchema.parse({
    kind: "success",
    probability: answer.noul,
    provider,
    requestedModel: args.requestedModel,
    resolvedModel: parsed.data.model,
    latencyMs: Math.max(0, Math.round(Date.now() - args.startedAt)),
    inputTokens: parsed.data.usage.input_tokens,
    outputTokens: parsed.data.usage.output_tokens,
  })
}

export const createJevShadowDecisionProvider = (
  options: JevShadowDecisionProviderClientOptions,
): JevShadowDecisionProviderShape => {
  const baseUrl = options.baseUrl ?? DEFAULT_JEV_BASE_URL
  const model = options.model ?? DEFAULT_JEV_MODEL
  const timeoutMs =
    options.timeoutMs !== undefined && isValidTimeout(options.timeoutMs) ? options.timeoutMs : DEFAULT_JEV_TIMEOUT_MS
  const fetchClient = options.fetch ?? fetch

  return {
    decide: (input: JevShadowDecisionProviderRequest): Effect.Effect<JevShadowProviderResult> =>
      Effect.gen(function* () {
        const startedAt = Date.now()
        const timeoutSignal = yield* Effect.try({
          try: () => AbortSignal.timeout(timeoutMs),
          catch: () => new Error("Unable to create JEV timeout signal"),
        }).pipe(Effect.catch(() => Effect.succeed(undefined)))

        if (timeoutSignal === undefined) {
          return failure({ errorCategory: "provider", requestedModel: model, startedAt })
        }

        const requestResult = yield* Effect.tryPromise((signal) =>
          Promise.resolve().then(async () => {
            let response: Response

            try {
              response = await fetchClient(requestUrl(baseUrl), {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${options.apiKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  state: input.state,
                  model,
                  questions: {
                    [input.question.id]: {
                      type: "noul",
                      instructions: input.question.prompt,
                    },
                  },
                }),
                signal: AbortSignal.any([signal, timeoutSignal]),
              })
            } catch {
              return { kind: "network-failure" as const }
            }

            if (!response.ok) return { kind: "response" as const, response }

            try {
              return { kind: "success" as const, body: await response.json() }
            } catch {
              return { kind: "body-read-failure" as const }
            }
          }),
        ).pipe(Effect.catch(() => Effect.succeed({ kind: "network-failure" as const })))

        if (requestResult.kind === "network-failure") {
          return failure({
            errorCategory: networkFailureCategory(timeoutSignal),
            requestedModel: model,
            startedAt,
          })
        }

        if (requestResult.kind === "body-read-failure") {
          return failure({
            errorCategory: bodyReadFailureCategory(timeoutSignal),
            requestedModel: model,
            startedAt,
          })
        }

        if (requestResult.kind === "response") {
          return failure({
            errorCategory: responseCategory(requestResult.response.status),
            requestedModel: model,
            startedAt,
          })
        }

        return parseSuccessResponse({
          body: requestResult.body,
          questionId: input.question.id,
          requestedModel: model,
          startedAt,
        })
      }),
  }
}

export const createUnconfiguredJevShadowDecisionProvider = (
  options: { readonly model?: string | undefined } = {},
): JevShadowDecisionProviderShape => {
  const model = options.model ?? DEFAULT_JEV_MODEL

  return {
    decide: () =>
      Effect.sync(() => {
        const startedAt = Date.now()
        return failure({ errorCategory: "authentication", requestedModel: model, startedAt })
      }),
  }
}

export const JevShadowDecisionProviderUnconfigured = Layer.succeed(
  JevShadowDecisionProvider,
  createUnconfiguredJevShadowDecisionProvider(),
)

export const JevShadowDecisionProviderLive = Layer.effect(
  JevShadowDecisionProvider,
  Effect.gen(function* () {
    const apiKey = yield* parseEnvOptional("LAT_JEV_API_KEY", "string")
    const baseUrl = (yield* parseEnvOptional("LAT_JEV_BASE_URL", "string")) ?? DEFAULT_JEV_BASE_URL
    const model = (yield* parseEnvOptional("LAT_JEV_MODEL", "string")) ?? DEFAULT_JEV_MODEL
    const timeoutMs = yield* parseEnvOptional("LAT_JEV_TIMEOUT_MS", "number").pipe(
      Effect.catch(() => Effect.succeed(undefined)),
      Effect.map((value) => (value === undefined || !isValidTimeout(value) ? DEFAULT_JEV_TIMEOUT_MS : value)),
    )

    if (apiKey === undefined) return createUnconfiguredJevShadowDecisionProvider({ model })

    return createJevShadowDecisionProvider({ apiKey, baseUrl, model, timeoutMs })
  }),
)
