import { ChSqlClient, OrganizationId, ProjectId, SessionId, SqlClient, TraceId } from "@domain/shared"
import { createFakeChSqlClient, createFakeSqlClient } from "@domain/shared/testing"
import type { SessionDetail } from "@domain/spans"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { SESSION_ASSESSMENT_PAGE_SIZE } from "../entities/session-assessment.ts"
import type { AssessmentFinding, NormalizedSessionAssessmentInput } from "../entities/session-assessment-input.ts"
import {
  SessionAssessmentBulkJudgmentSource,
  SessionAssessmentBulkTelemetrySource,
} from "../ports/session-assessment-sources.ts"
import { resolveSessionAssessmentPage } from "../resolver/resolve-session-assessment.ts"
import { readSessionAssessmentBatch } from "./read-session-assessment-batch.ts"

const organizationId = OrganizationId("org-1")
const projectId = ProjectId("project-1")
const cutoff = new Date("2026-01-02T00:00:00.000Z")
const largeFindingCount = 10_000
const bulkSessionCount = 250
const maximumResolverHeapGrowthBytes = 128 * 1024 * 1024

const finding = (index: number): AssessmentFinding => ({
  evidenceKey: `finding-${String(index).padStart(5, "0")}`,
  label: `Finding ${index}`,
  source: "score",
  signalIds: [],
  scoreIds: [`score-${index}`],
  occurrenceCount: 1,
  chronology: { occurredAt: new Date(1_700_000_000_000 + index) },
  anchors: [],
  destinations: [],
  independentHumanEvidence: false,
  kind: "standaloneScore",
  negative: false,
  judgmentKind: "annotation",
})

const session = (index: number): SessionDetail =>
  ({
    organizationId,
    projectId,
    sessionId: SessionId(`session-${index}`),
    traceIds: [TraceId(`trace-${index}`)],
    systemInstructions: [],
    inputMessages: [],
    lastInputMessages: [],
    outputMessages: [{ role: "assistant", parts: [{ type: "text", content: "Done" }] }],
    tags: [],
    definedTools: [],
    tokensInput: 1,
    tokensCacheRead: 0,
    tokensCacheCreate: 0,
    costTotalMicrocents: 2,
    durationNs: 3,
    startTime: new Date("2026-01-01T00:00:00.000Z"),
    endTime: new Date("2026-01-01T00:00:01.000Z"),
  }) as unknown as SessionDetail

describe("session assessment representative load", () => {
  it("keeps a large single-session resolution page-bounded with controlled heap growth", () => {
    const input: NormalizedSessionAssessmentInput = {
      sessionId: SessionId("large-session"),
      observedMicrocents: 0,
      observedDurationNs: 0,
      findings: Array.from({ length: largeFindingCount }, (_, index) => finding(index)),
      readers: [],
      screeningDecisions: [],
    }
    const before = process.memoryUsage().heapUsed

    const assessment = resolveSessionAssessmentPage(input, { cutoff })
    const heapGrowth = Math.max(0, process.memoryUsage().heapUsed - before)

    expect(assessment.items).toHaveLength(SESSION_ASSESSMENT_PAGE_SIZE)
    expect(assessment.nextCursor).toBeDefined()
    expect(heapGrowth).toBeLessThan(maximumResolverHeapGrowthBytes)
  })

  it("uses one telemetry and one judgment read for a representative bulk batch", async () => {
    let telemetryReads = 0
    let judgmentReads = 0
    const sessions = Array.from({ length: bulkSessionCount }, (_, index) => session(index))
    const layer = Layer.mergeAll(
      Layer.succeed(SessionAssessmentBulkTelemetrySource, {
        read: () => {
          telemetryReads += 1
          return Effect.succeed(
            sessions.map((session) => ({
              session,
              spans: [],
              generations: [],
              toolCalls: [],
              memoryEvents: [],
              moments: { moments: [], labels: [] },
              screeningDecisions: [],
            })),
          )
        },
      }),
      Layer.succeed(SessionAssessmentBulkJudgmentSource, {
        read: (input) => {
          judgmentReads += 1
          return Effect.succeed(input.sessions.map(({ sessionId }) => ({ sessionId, scores: [], signals: [] })))
        },
      }),
      Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId })),
      Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
    )

    const assessments = await Effect.runPromise(
      readSessionAssessmentBatch({
        organizationId,
        projectId,
        sessionIds: sessions.map(({ sessionId }) => sessionId),
        cutoff,
      }).pipe(Effect.provide(layer)),
    )

    expect(assessments).toHaveLength(bulkSessionCount)
    expect({ telemetryReads, judgmentReads }).toEqual({ telemetryReads: 1, judgmentReads: 1 })
  })
})
