import {
  type JevDecisionProviderManyRequest,
  JevShadowDecisionProvider,
  type JevShadowDecisionProviderRequest,
  type JevShadowDecisionProviderShape,
  type JevShadowProviderAuditMetadata,
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
export const JEV_PRECLASSIFIER_TIMEOUT_MS = 5_000
export const MAX_JEV_TIMEOUT_MS = 5_000

const provider = "typesafe-ai"

const noulAnswerSchema = z.object({ type: z.literal("noul"), noul: z.number().finite().min(0).max(1) })
const systemOneResponseSchema = z.object({
  answers: z.record(z.string(), z.unknown()),
  usage: z.object({ input_tokens: z.number().int().nonnegative(), output_tokens: z.number().int().nonnegative() }),
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

const audit = (args: {
  readonly requestedModel: string
  readonly startedAt: number
  readonly resolvedModel?: string | null
  readonly inputTokens?: number | null
  readonly outputTokens?: number | null
}): JevShadowProviderAuditMetadata => ({
  provider,
  requestedModel: args.requestedModel,
  resolvedModel: args.resolvedModel ?? null,
  latencyMs: Math.max(0, Math.round(Date.now() - args.startedAt)),
  inputTokens: args.inputTokens ?? null,
  outputTokens: args.outputTokens ?? null,
})

const failure = (
  errorCategory: JevShadowProviderFailureKind,
  metadata: JevShadowProviderAuditMetadata,
): JevShadowProviderResult => jevShadowProviderResultSchema.parse({ kind: "failure", errorCategory, ...metadata })

const allFailed = (
  questions: JevDecisionProviderManyRequest["questions"],
  errorCategory: JevShadowProviderFailureKind,
  metadata: JevShadowProviderAuditMetadata,
): Readonly<Record<string, JevShadowProviderResult>> =>
  Object.fromEntries(questions.map((question) => [question.id, failure(errorCategory, metadata)]))

type JevRequestResult =
  | { readonly kind: "success"; readonly body: unknown }
  | { readonly kind: "response"; readonly response: Response }
  | { readonly kind: "network-failure" }
  | { readonly kind: "body-read-failure" }

const performJevRequest = (args: {
  readonly fetchClient: typeof fetch
  readonly url: string
  readonly apiKey: string
  readonly model: string
  readonly input: JevDecisionProviderManyRequest
  readonly timeoutSignal: AbortSignal
}): Effect.Effect<JevRequestResult> =>
  Effect.tryPromise((signal) =>
    Promise.resolve().then(async (): Promise<JevRequestResult> => {
      let response: Response
      try {
        response = await args.fetchClient(args.url, {
          method: "POST",
          headers: { Authorization: `Bearer ${args.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            state: args.input.state,
            model: args.model,
            questions: Object.fromEntries(
              args.input.questions.map((question) => [question.id, { type: "noul", instructions: question.prompt }]),
            ),
          }),
          signal: AbortSignal.any([signal, args.timeoutSignal]),
        })
      } catch {
        return { kind: "network-failure" }
      }
      if (!response.ok) return { kind: "response", response }
      try {
        return { kind: "success", body: await response.json() }
      } catch {
        return { kind: "body-read-failure" }
      }
    }),
  ).pipe(Effect.catch(() => Effect.succeed({ kind: "network-failure" as const })))

const requestFailureCategory = (
  result: Exclude<JevRequestResult, { readonly kind: "success" }>,
  timeoutSignal: AbortSignal,
): JevShadowProviderFailureKind => {
  if (result.kind === "response") return responseCategory(result.response.status)
  if (timeoutSignal.aborted) return "timeout"
  return result.kind === "body-read-failure" ? "malformed-response" : "provider"
}

export const createJevShadowDecisionProvider = (
  options: JevShadowDecisionProviderClientOptions,
): JevShadowDecisionProviderShape => {
  const baseUrl = options.baseUrl ?? DEFAULT_JEV_BASE_URL
  const model = options.model ?? DEFAULT_JEV_MODEL
  const timeoutMs =
    options.timeoutMs !== undefined && isValidTimeout(options.timeoutMs) ? options.timeoutMs : DEFAULT_JEV_TIMEOUT_MS
  const fetchClient = options.fetch ?? fetch

  const decideMany = (input: JevDecisionProviderManyRequest) =>
    Effect.gen(function* () {
      const startedAt = Date.now()
      const timeoutSignal = yield* Effect.try({
        try: () => AbortSignal.timeout(timeoutMs),
        catch: () => new Error("Unable to create JEV timeout signal"),
      }).pipe(Effect.catch(() => Effect.succeed(undefined)))
      if (!timeoutSignal) return allFailed(input.questions, "provider", audit({ requestedModel: model, startedAt }))

      const requestResult = yield* performJevRequest({
        fetchClient,
        url: requestUrl(baseUrl),
        apiKey: options.apiKey,
        model,
        input,
        timeoutSignal,
      })

      if (requestResult.kind !== "success") {
        return allFailed(
          input.questions,
          requestFailureCategory(requestResult, timeoutSignal),
          audit({ requestedModel: model, startedAt }),
        )
      }

      const parsed = systemOneResponseSchema.safeParse(requestResult.body)
      if (!parsed.success) {
        return allFailed(input.questions, "malformed-response", audit({ requestedModel: model, startedAt }))
      }
      const metadata = audit({
        requestedModel: model,
        startedAt,
        resolvedModel: parsed.data.model,
        inputTokens: parsed.data.usage.input_tokens,
        outputTokens: parsed.data.usage.output_tokens,
      })
      return Object.fromEntries(
        input.questions.map((question) => {
          const answer = noulAnswerSchema.safeParse(parsed.data.answers[question.id])
          return [
            question.id,
            answer.success
              ? jevShadowProviderResultSchema.parse({ kind: "success", probability: answer.data.noul, ...metadata })
              : failure("malformed-response", metadata),
          ]
        }),
      )
    })

  return {
    decideMany,
    decide: (input: JevShadowDecisionProviderRequest) =>
      decideMany({ questions: [input.question], state: input.state }).pipe(
        Effect.map(
          (results) =>
            results[input.question.id] ??
            failure("malformed-response", audit({ requestedModel: model, startedAt: Date.now() })),
        ),
      ),
  }
}

export const createUnconfiguredJevShadowDecisionProvider = (
  options: { readonly model?: string | undefined } = {},
): JevShadowDecisionProviderShape => {
  const model = options.model ?? DEFAULT_JEV_MODEL
  const fail = () => failure("authentication", audit({ requestedModel: model, startedAt: Date.now() }))
  return {
    decide: () => Effect.sync(fail),
    decideMany: (input) =>
      Effect.sync(() => Object.fromEntries(input.questions.map((question) => [question.id, fail()]))),
  }
}

export const JevShadowDecisionProviderUnconfigured = Layer.succeed(
  JevShadowDecisionProvider,
  createUnconfiguredJevShadowDecisionProvider(),
)

const providerLayer = (defaultTimeoutMs: number) =>
  Layer.effect(
    JevShadowDecisionProvider,
    Effect.gen(function* () {
      const apiKey = yield* parseEnvOptional("LAT_JEV_API_KEY", "string")
      const baseUrl = (yield* parseEnvOptional("LAT_JEV_BASE_URL", "string")) ?? DEFAULT_JEV_BASE_URL
      const model = (yield* parseEnvOptional("LAT_JEV_MODEL", "string")) ?? DEFAULT_JEV_MODEL
      const timeoutMs = yield* parseEnvOptional("LAT_JEV_TIMEOUT_MS", "number").pipe(
        Effect.catch(() => Effect.succeed(undefined)),
        Effect.map((value) => (value === undefined || !isValidTimeout(value) ? defaultTimeoutMs : value)),
      )
      if (!apiKey) return createUnconfiguredJevShadowDecisionProvider({ model })
      return createJevShadowDecisionProvider({ apiKey, baseUrl, model, timeoutMs })
    }),
  )

export const JevShadowDecisionProviderLive = providerLayer(DEFAULT_JEV_TIMEOUT_MS)
export const JevPreclassifierDecisionProviderLive = providerLayer(JEV_PRECLASSIFIER_TIMEOUT_MS)
