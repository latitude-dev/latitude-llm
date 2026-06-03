import { AIGenerate } from "@domain/ai"
import { LatitudeApiClient } from "@latitude-data/sdk"
import { AIGenerateLive } from "@platform/ai-vercel"
import { Cause, Effect } from "effect"
import { describe, expect, it } from "vitest"
import { z } from "zod"
import { FLAGGER_MAX_TOKENS, FLAGGER_MODEL } from "../../constants.ts"

const REGRESSION_DATASET_PROJECT_SLUG = "latitude"
const MALFORMED_JSON_OUTPUT_REGRESSION_DATASET_SLUG = "malformed-json-output-regression-test"
const REGRESSION_DATASET_PAGE_SIZE = 200

const OLD_MESSAGE_INDEX_CONTRACT =
  "- Include messageIndex only when one transcript line is clearly the best evidence; it must be a non-negative integer no larger than 10000."
const NEW_MESSAGE_INDEX_CONTRACT =
  '- Include messageIndex only when one transcript line is clearly the best evidence. messageIndex must be exactly one quoted integer string like "0" or "12"; never output it as a JSON number, decimal, exponent, comma-separated list, range, or unquoted value.'

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

const malformedJsonOutputRegressionRowSchema = z.object({
  metadata: z.preprocess(
    (value) => {
      if (typeof value !== "string") return value
      return JSON.parse(value) as unknown
    },
    z.object({
      traceMetadata: z
        .object({
          flaggerSlug: z.string().min(1).optional(),
        })
        .optional(),
      allMessages: z.array(regressionMessageSchema),
      systemInstructions: z.array(regressionMessagePartSchema),
      tags: z.array(z.string()).optional(),
    }),
  ),
})

const classifierOutputSchema = z.object({
  matched: z.boolean().optional().default(false),
  feedback: z.string().min(1).nullable().optional(),
  messageIndex: z.string().regex(/^\d+$/).optional(),
})

type MalformedJsonOutputRegressionRow = z.infer<typeof malformedJsonOutputRegressionRowSchema>["metadata"]
type RegressionMessage = z.infer<typeof regressionMessageSchema>
type ClassifierOutput = z.infer<typeof classifierOutputSchema>

const categoryToFlaggerSlug: Readonly<Record<string, string>> = {
  forgetting: "forgetting",
  frustration: "frustration",
  jailbreaking: "jailbreaking",
  laziness: "laziness",
  nsfw: "nsfw",
  refusal: "refusal",
  thrashing: "trashing",
  trashing: "trashing",
}

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (value) return value
  throw new Error(`${name} is required to run flagger regression tests`)
}

async function fetchMalformedJsonOutputRegressionRows(): Promise<MalformedJsonOutputRegressionRow[]> {
  const client = new LatitudeApiClient({
    token: readRequiredEnv("LAT_LATITUDE_TELEMETRY_API_KEY"),
    baseUrl: process.env.LAT_LATITUDE_API_URL?.trim() || "https://api.latitude.so",
    maxRetries: 0,
  })

  const rows: MalformedJsonOutputRegressionRow[] = []
  let cursor: string | undefined

  do {
    const page = await client.datasets.listRows(
      REGRESSION_DATASET_PROJECT_SLUG,
      MALFORMED_JSON_OUTPUT_REGRESSION_DATASET_SLUG,
      {
        limit: REGRESSION_DATASET_PAGE_SIZE,
        ...(cursor ? { cursor } : {}),
      },
    )

    rows.push(...page.items.map((row) => malformedJsonOutputRegressionRowSchema.parse(row).metadata))
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

function extractClassifierSystemPrompt(row: MalformedJsonOutputRegressionRow): string | undefined {
  const systemMessage = row.allMessages.find((message) => message.role === "system")
  return systemMessage ? textFromParts(systemMessage.parts) : textFromParts(row.systemInstructions)
}

function extractClassifierPrompt(row: MalformedJsonOutputRegressionRow): string | undefined {
  const userMessage = findLastMessageByRole(row.allMessages, "user")
  return userMessage ? textFromParts(userMessage.parts) : undefined
}

function patchMessageIndexContract(systemPrompt: string): string {
  return systemPrompt.replace(OLD_MESSAGE_INDEX_CONTRACT, NEW_MESSAGE_INDEX_CONTRACT)
}

function identifyFlaggerSlug(systemPrompt: string): string | undefined {
  const directCategory = /matches the ([A-Za-z-]+) issue category\b/.exec(systemPrompt)?.[1]
  if (directCategory) return categoryToFlaggerSlug[directCategory.toLowerCase()]

  for (const [category, slug] of Object.entries(categoryToFlaggerSlug)) {
    if (systemPrompt.toLowerCase().includes(`${category} issue category`)) return slug
  }

  return undefined
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

describe("flagger malformed JSON output regression dataset", () => {
  regressionIt(
    "replays captured classifier calls without malformed structured-output failures",
    async () => {
      const rows = await fetchMalformedJsonOutputRegressionRows()
      expect(rows.length, "malformed JSON output regression dataset should contain at least one row").toBeGreaterThan(0)

      const calls = rows.map((row, index) => {
        const capturedSystem = extractClassifierSystemPrompt(row)
        const prompt = extractClassifierPrompt(row)

        if (!capturedSystem) {
          throw new Error(`row ${index} should include the captured classifier system prompt`)
        }
        if (!prompt) {
          throw new Error(`row ${index} should include the captured classifier user prompt`)
        }

        const system = patchMessageIndexContract(capturedSystem)
        const flaggerSlug = identifyFlaggerSlug(system)
        expect(flaggerSlug, `row ${index} should identify the classifier from the system prompt`).toBeTruthy()

        return Effect.exit(
          Effect.gen(function* () {
            const ai = yield* AIGenerate
            const result = yield* ai.generate<ClassifierOutput>({
              ...FLAGGER_MODEL,
              maxTokens: FLAGGER_MAX_TOKENS,
              system,
              prompt,
              schema: classifierOutputSchema,
            })

            return result.object
          }).pipe(Effect.provide(AIGenerateLive)),
        ).pipe(
          Effect.map((exit) => ({
            index,
            flaggerSlug,
            expectedFlaggerSlug: row.traceMetadata?.flaggerSlug,
            exit,
          })),
        )
      })

      const results = await Effect.runPromise(Effect.all(calls, { concurrency: 5 }))

      for (const { index, flaggerSlug, expectedFlaggerSlug, exit } of results) {
        if (expectedFlaggerSlug) {
          expect(flaggerSlug, `row ${index} classifier slug should match row metadata`).toBe(expectedFlaggerSlug)
        }

        if (exit._tag === "Failure") {
          const cause = Cause.pretty(exit.cause)
          expect(
            isMalformedStructuredOutputFailure(cause),
            `row ${index} (${flaggerSlug}) must not fail with malformed structured output`,
          ).toBe(false)
          throw new Error(`row ${index} (${flaggerSlug}) should generate structured classifier output:\n${cause}`)
        }

        if (exit.value.matched) {
          expect(
            exit.value.messageIndex,
            `row ${index} (${flaggerSlug}) should preserve a quoted messageIndex`,
          ).toMatch(/^\d+$/)
        }
      }
    },
    600_000,
  )
})
