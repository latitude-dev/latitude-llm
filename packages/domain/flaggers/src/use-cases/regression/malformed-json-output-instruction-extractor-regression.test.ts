import { AIGenerate } from "@domain/ai"
import { LatitudeApiClient } from "@latitude-data/sdk"
import { AIGenerateLive } from "@platform/ai-vercel"
import { Cause, Effect } from "effect"
import { describe, expect, it } from "vitest"
import { z } from "zod"
import { FLAGGER_INSTRUCTION_EXTRACTOR_MODEL } from "../../constants.ts"

const REGRESSION_DATASET_PROJECT_SLUG = "latitude"
const REGRESSION_DATASET_SLUG = "malformed-json-output-in-system-instructions-extractor"
const REGRESSION_DATASET_PAGE_SIZE = 200
const REGRESSION_INSTRUCTION_EXTRACTOR_MAX_TOKENS = 1024

const regressionMessagePartSchema = z
  .object({
    type: z.string(),
    content: z.string().optional(),
  })
  .passthrough()

const regressionMessageSchema = z
  .object({
    role: z.enum(["system", "user", "assistant", "tool"]),
    parts: z.array(regressionMessagePartSchema),
  })
  .passthrough()

const regressionRowSchema = z.object({
  metadata: z.preprocess(
    (value) => {
      if (typeof value !== "string") return value
      return JSON.parse(value) as unknown
    },
    z.object({
      allMessages: z.array(regressionMessageSchema),
      systemInstructions: z.array(regressionMessagePartSchema),
      traceMetadata: z
        .object({
          flaggerSlug: z.string().min(1).optional(),
          stage: z.string().optional(),
        })
        .optional(),
    }),
  ),
})

const instructionExtractorOutputSchema = z
  .object({
    understood: z.boolean(),
    agentContext: z.string(),
    reasonIfNotUnderstood: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.understood && !value.agentContext.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["agentContext"],
        message: "agentContext is required when understood=true",
      })
    }
    if (!value.understood && !value.reasonIfNotUnderstood?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reasonIfNotUnderstood"],
        message: "reasonIfNotUnderstood is required when understood=false",
      })
    }
  })

type RegressionRow = z.infer<typeof regressionRowSchema>["metadata"]
type RegressionMessage = z.infer<typeof regressionMessageSchema>
type InstructionExtractorOutput = z.infer<typeof instructionExtractorOutputSchema>

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (value) return value
  throw new Error(`${name} is required to run flagger regression tests`)
}

async function fetchRegressionRows(): Promise<RegressionRow[]> {
  const client = new LatitudeApiClient({
    token: readRequiredEnv("LAT_LATITUDE_TELEMETRY_API_KEY"),
    baseUrl: process.env.LAT_LATITUDE_API_URL?.trim() || "https://api.latitude.so",
    maxRetries: 0,
  })

  const rows: RegressionRow[] = []
  let cursor: string | undefined

  do {
    const page = await client.datasets.listRows(REGRESSION_DATASET_PROJECT_SLUG, REGRESSION_DATASET_SLUG, {
      limit: REGRESSION_DATASET_PAGE_SIZE,
      ...(cursor ? { cursor } : {}),
    })

    rows.push(...page.items.map((row) => regressionRowSchema.parse(row).metadata))
    cursor = page.nextCursor ?? undefined
  } while (cursor)

  return rows
}

function textFromParts(parts: readonly z.infer<typeof regressionMessagePartSchema>[]): string {
  return parts
    .flatMap((part) => (part.type === "text" && part.content?.trim() ? [part.content.trim()] : []))
    .join("\n\n")
}

function findLastMessageByRole(
  messages: readonly RegressionMessage[],
  role: RegressionMessage["role"],
): RegressionMessage | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role === role) return message
  }

  return undefined
}

function extractSystemPrompt(row: RegressionRow): string | undefined {
  const systemMessage = row.allMessages.find((message) => message.role === "system")
  return systemMessage ? textFromParts(systemMessage.parts) : textFromParts(row.systemInstructions)
}

function extractUserPrompt(row: RegressionRow): string | undefined {
  const userMessage = findLastMessageByRole(row.allMessages, "user")
  return userMessage ? textFromParts(userMessage.parts) : undefined
}

function extractAssistantOutput(row: RegressionRow): string | undefined {
  const assistantMessage = findLastMessageByRole(row.allMessages, "assistant")
  return assistantMessage ? textFromParts(assistantMessage.parts) : undefined
}

function isMalformedStructuredOutputFailure(cause: string): boolean {
  return (
    cause.includes("response did not match schema") ||
    cause.includes("AI_NoObjectGeneratedError") ||
    cause.includes("AI_NoOutputGeneratedError") ||
    cause.includes("No output generated")
  )
}

const regressionIt = process.env.RUN_FLAGGER_REGRESSION === "true" ? it : it.skip

describe("flagger instruction extractor malformed JSON output regression dataset", () => {
  regressionIt("contains captured malformed instruction extractor output", async () => {
    const rows = await fetchRegressionRows()
    expect(
      rows.length,
      "instruction extractor malformed JSON output dataset should contain at least one row",
    ).toBeGreaterThan(0)

    for (const [index, row] of rows.entries()) {
      const assistantOutput = extractAssistantOutput(row)
      if (!assistantOutput) throw new Error(`row ${index} should include the captured extractor assistant output`)

      expect(() => JSON.parse(assistantOutput), `row ${index} should contain malformed JSON output`).toThrow()
    }
  })

  regressionIt(
    "replays captured instruction extractor calls without malformed structured-output failures",
    async () => {
      const rows = await fetchRegressionRows()
      expect(
        rows.length,
        "instruction extractor malformed JSON output dataset should contain at least one row",
      ).toBeGreaterThan(0)

      const calls = rows.map((row, index) => {
        const system = extractSystemPrompt(row)
        const prompt = extractUserPrompt(row)

        if (!system) throw new Error(`row ${index} should include the captured extractor system prompt`)
        if (!prompt) throw new Error(`row ${index} should include the captured extractor user prompt`)

        return Effect.exit(
          Effect.gen(function* () {
            const ai = yield* AIGenerate
            const result = yield* ai.generate<InstructionExtractorOutput>({
              ...FLAGGER_INSTRUCTION_EXTRACTOR_MODEL,
              maxTokens: REGRESSION_INSTRUCTION_EXTRACTOR_MAX_TOKENS,
              system,
              prompt,
              schema: instructionExtractorOutputSchema,
            })

            return result.object
          }).pipe(Effect.provide(AIGenerateLive)),
        ).pipe(Effect.map((exit) => ({ index, flaggerSlug: row.traceMetadata?.flaggerSlug, exit })))
      })

      const results = await Effect.runPromise(Effect.all(calls, { concurrency: 5 }))

      for (const { index, flaggerSlug, exit } of results) {
        if (exit._tag === "Failure") {
          const cause = Cause.pretty(exit.cause)
          expect(
            isMalformedStructuredOutputFailure(cause),
            `row ${index} (${flaggerSlug ?? "unknown"}) must not fail with malformed structured output`,
          ).toBe(false)
          throw new Error(`row ${index} (${flaggerSlug ?? "unknown"}) should generate extractor output:\n${cause}`)
        }

        if (exit.value.understood) {
          expect(
            exit.value.agentContext,
            `row ${index} (${flaggerSlug ?? "unknown"}) should extract agent context`,
          ).toEqual(expect.any(String))
          expect(exit.value.agentContext.trim()).not.toBe("")
        } else {
          expect(
            exit.value.reasonIfNotUnderstood,
            `row ${index} (${flaggerSlug ?? "unknown"}) should explain why context was not understood`,
          ).toEqual(expect.any(String))
        }
      }
    },
    600_000,
  )
})
