import {
  CacheStore,
  ExternalUserId,
  OrganizationId,
  ProjectId,
  SessionId,
  SimulationId,
  SpanId,
  TraceId,
} from "@domain/shared"
import type { TraceDetail } from "@domain/spans"
import { LatitudeApiClient } from "@latitude-data/sdk"
import { createAiLayer } from "@platform/ai"
import { AIGenerateLive } from "@platform/ai-vercel"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { z } from "zod"
import { classifyTraceForFlaggerUseCase } from "../run-flagger.ts"

const INPUT = {
  organizationId: "a".repeat(24),
  projectId: "b".repeat(24),
  traceId: "c".repeat(32),
} as const

const REGRESSION_DATASET_PROJECT_SLUG = "latitude"
const FALSE_POSITIVE_REGRESSION_DATASET_SLUG = "flagger-classification-regression-dataset"
const REGRESSION_DATASET_PAGE_SIZE = 200
const EXPECTED_FALSE_POSITIVE_REGRESSION_ROWS = 55

const falsePositiveRegressionRowSchema = z.object({
  metadata: z.preprocess(
    (value) => {
      if (typeof value !== "string") return value
      return JSON.parse(value) as unknown
    },
    z.object({
      traceMetadata: z.object({
        flaggerSlug: z.string().min(1),
      }),
      allMessages: z.array(z.unknown()),
      systemInstructions: z.array(z.unknown()),
    }),
  ),
})

type FalsePositiveRegressionRow = z.infer<typeof falsePositiveRegressionRowSchema>["metadata"]

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (value) return value
  throw new Error(`${name} is required to run flagger regression tests`)
}

async function fetchFalsePositiveRegressionRows(): Promise<FalsePositiveRegressionRow[]> {
  const client = new LatitudeApiClient({
    token: readRequiredEnv("LAT_LATITUDE_TELEMETRY_API_KEY"),
    baseUrl: process.env.LAT_LATITUDE_API_URL?.trim() || "https://api.latitude.so",
    maxRetries: 0,
  })

  const rows: FalsePositiveRegressionRow[] = []
  let cursor: string | undefined

  do {
    const page = await client.datasets.listRows(
      REGRESSION_DATASET_PROJECT_SLUG,
      FALSE_POSITIVE_REGRESSION_DATASET_SLUG,
      {
        limit: REGRESSION_DATASET_PAGE_SIZE,
        ...(cursor ? { cursor } : {}),
      },
    )

    rows.push(...page.items.map((row) => falsePositiveRegressionRowSchema.parse(row).metadata))
    cursor = page.nextCursor ?? undefined
  } while (cursor)

  return rows
}

function createMemoryCacheLayer() {
  const values = new Map<string, string>()

  return Layer.succeed(CacheStore, {
    get: (key: string) => Effect.succeed(values.get(key) ?? null),
    set: (key: string, value: string) =>
      Effect.sync(() => {
        values.set(key, value)
      }),
    delete: (key: string) =>
      Effect.sync(() => {
        values.delete(key)
      }),
  })
}

function makeTraceDetail(input: {
  readonly traceId: string
  readonly allMessages: TraceDetail["allMessages"]
  readonly systemInstructions: TraceDetail["systemInstructions"]
}): TraceDetail {
  return {
    organizationId: OrganizationId(INPUT.organizationId),
    projectId: ProjectId(INPUT.projectId),
    traceId: TraceId(input.traceId),
    spanCount: 1,
    errorCount: 0,
    startTime: new Date("2026-01-01T00:00:00.000Z"),
    endTime: new Date("2026-01-01T00:00:01.000Z"),
    durationNs: 1,
    timeToFirstTokenNs: 0,
    tokensInput: 0,
    tokensOutput: 0,
    tokensCacheRead: 0,
    tokensCacheCreate: 0,
    tokensReasoning: 0,
    tokensTotal: 0,
    costInputMicrocents: 0,
    costOutputMicrocents: 0,
    costTotalMicrocents: 0,
    sessionId: SessionId("session"),
    userId: ExternalUserId("user"),
    simulationId: SimulationId(""),
    tags: [],
    metadata: {},
    models: [],
    providers: [],
    serviceNames: [],
    rootSpanId: SpanId("r".repeat(16)),
    rootSpanName: "root",
    systemInstructions: input.systemInstructions,
    inputMessages: [],
    outputMessages: input.allMessages,
    allMessages: input.allMessages,
  }
}

const regressionIt = process.env.RUN_FLAGGER_REGRESSION === "true" ? it : it.skip

describe("flagger false-positive regression dataset", () => {
  regressionIt(
    "classifies the Latitude false-positive regression dataset as no-match with live LLM flaggers",
    async () => {
      const rows = await fetchFalsePositiveRegressionRows()
      expect(rows).toHaveLength(EXPECTED_FALSE_POSITIVE_REGRESSION_ROWS)

      const aiLayer = createAiLayer(AIGenerateLive)

      const classifications = rows.map((row, index) => {
        const traceId = `${INPUT.traceId.slice(0, 30)}${String(index).padStart(2, "0")}`

        return classifyTraceForFlaggerUseCase({
          organizationId: INPUT.organizationId,
          projectId: INPUT.projectId,
          traceId,
          flaggerSlug: row.traceMetadata.flaggerSlug,
          trace: makeTraceDetail({
            traceId,
            allMessages: row.allMessages as TraceDetail["allMessages"],
            systemInstructions: row.systemInstructions as TraceDetail["systemInstructions"],
          }),
        }).pipe(
          Effect.provide(Layer.mergeAll(aiLayer, createMemoryCacheLayer())),
          Effect.map((result) => ({ index, flaggerSlug: row.traceMetadata.flaggerSlug, result })),
        )
      })

      const results = await Effect.runPromise(Effect.all(classifications, { concurrency: 10 }))

      for (const { index, flaggerSlug, result } of results) {
        expect(result, `row ${index} (${flaggerSlug}) should be no-match`).toEqual({ matched: false })
      }
    },
    600_000,
  )
})
