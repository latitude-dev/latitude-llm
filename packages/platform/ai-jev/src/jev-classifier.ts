import { AIClassify, type AIClassifyShape, AICredentialError, AIError, type ClassifyResult } from "@domain/ai"
import { parseEnvOptional } from "@platform/env"
import { Effect, Layer } from "effect"
import { z } from "zod"
import { DEFAULT_JEV_BASE_URL, DEFAULT_JEV_MODEL, DEFAULT_JEV_TIMEOUT_MS } from "./jev-shadow-decision-provider.ts"

const TYPESAFE_PROVIDER = "typesafe-ai"
const MICROCENTS_PER_INPUT_TOKEN = 4.2

const choiceAnswerSchema = z.object({
  type: z.literal("choice"),
  probabilities: z.record(z.string(), z.number().finite().min(0).max(1)),
})

const responseSchema = z.object({
  answers: z.object({ classification: choiceAnswerSchema }),
  usage: z.object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
  }),
  model: z.string().min(1),
})

export interface JevClassifierOptions {
  readonly apiKey: string
  readonly baseUrl?: string
  readonly model?: string
  readonly timeoutMs?: number
  readonly fetch?: typeof fetch
}

const toDurationNs = (startedAt: number): number => Math.max(0, Math.round((performance.now() - startedAt) * 1_000_000))

const requestUrl = (baseUrl: string): string => {
  let end = baseUrl.length
  while (end > 0 && baseUrl.charCodeAt(end - 1) === 47) end -= 1
  return `${baseUrl.slice(0, end)}/v1/systemone`
}

const parseResponse = (body: unknown, optionNames: readonly string[]) => {
  const parsed = responseSchema.safeParse(body)
  if (!parsed.success) throw new AIError({ message: "Jev returned an invalid classification response" })

  const probabilities = parsed.data.answers.classification.probabilities
  if (optionNames.some((name) => probabilities[name] === undefined)) {
    throw new AIError({ message: "Jev classification response omitted an option" })
  }
  return {
    ...parsed.data,
    probabilities: Object.fromEntries(optionNames.map((name) => [name, probabilities[name] as number])),
  }
}

export const createJevClassifier = (options: JevClassifierOptions): AIClassifyShape => {
  const baseUrl = options.baseUrl ?? DEFAULT_JEV_BASE_URL
  const model = options.model ?? DEFAULT_JEV_MODEL
  const timeoutMs = options.timeoutMs ?? DEFAULT_JEV_TIMEOUT_MS
  const fetchClient = options.fetch ?? fetch

  return {
    classify: (input) =>
      Effect.tryPromise({
        try: async (signal): Promise<ClassifyResult> => {
          const startedAt = performance.now()
          const response = await fetchClient(requestUrl(baseUrl), {
            method: "POST",
            headers: { Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              state: input.state,
              model,
              questions: {
                classification: {
                  type: "choice",
                  instructions: input.instructions,
                  criteria: input.criteria,
                },
              },
            }),
            signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
          })

          if (response.status === 401 || response.status === 403) {
            throw new AICredentialError({
              provider: TYPESAFE_PROVIDER,
              message: "Jev authentication failed",
              statusCode: response.status,
            })
          }
          if (!response.ok) throw new AIError({ message: `Jev classification failed with status ${response.status}` })

          const parsed = parseResponse(await response.json(), Object.keys(input.criteria))
          return {
            probabilities: parsed.probabilities,
            tokens: parsed.usage.input_tokens + parsed.usage.output_tokens,
            duration: toDurationNs(startedAt),
            cost: Math.round(parsed.usage.input_tokens * MICROCENTS_PER_INPUT_TOKEN),
            servedBy: { provider: TYPESAFE_PROVIDER, model: parsed.model },
            tokenUsage: { input: parsed.usage.input_tokens, output: parsed.usage.output_tokens },
          }
        },
        catch: (cause) => {
          if (cause instanceof AICredentialError || cause instanceof AIError) return cause
          return new AIError({ message: "Jev classification request failed", cause })
        },
      }),
  }
}

export const JevClassifierLive = Layer.effect(
  AIClassify,
  Effect.gen(function* () {
    const apiKey = yield* parseEnvOptional("LAT_JEV_API_KEY", "string")
    const baseUrl = (yield* parseEnvOptional("LAT_JEV_BASE_URL", "string")) ?? DEFAULT_JEV_BASE_URL
    const model = (yield* parseEnvOptional("LAT_JEV_MODEL", "string")) ?? DEFAULT_JEV_MODEL
    const timeoutMs = (yield* parseEnvOptional("LAT_JEV_TIMEOUT_MS", "number")) ?? DEFAULT_JEV_TIMEOUT_MS
    if (!apiKey) {
      return {
        classify: () =>
          Effect.fail(
            new AICredentialError({ provider: TYPESAFE_PROVIDER, message: "LAT_JEV_API_KEY is not configured" }),
          ),
      } satisfies AIClassifyShape
    }
    return createJevClassifier({ apiKey, baseUrl, model, timeoutMs })
  }),
)
