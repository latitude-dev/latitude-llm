import { ChSqlClient, type ChSqlClientShape, OrganizationId, ProjectId } from "@domain/shared"
import { ClaudeCodeSpanReader, type ClaudeCodeSpanReaderShape } from "@domain/spans"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { type FanOutWeeklyRunPublish, fanOutWeeklyRunUseCase } from "./wrapped-fan-out.ts"

const ORG_A = OrganizationId("org-aaa".padEnd(24, "x").slice(0, 24))
const ORG_B = OrganizationId("org-bbb".padEnd(24, "x").slice(0, 24))
const ORG_C = OrganizationId("org-ccc".padEnd(24, "x").slice(0, 24))
const PROJECT_A = ProjectId("proj-aaa".padEnd(24, "x").slice(0, 24))
const PROJECT_B = ProjectId("proj-bbb".padEnd(24, "x").slice(0, 24))
const PROJECT_C = ProjectId("proj-ccc".padEnd(24, "x").slice(0, 24))

const WINDOW_START = new Date("2026-05-04T00:00:00.000Z")
const WINDOW_END = new Date("2026-05-11T00:00:00.000Z")

interface PublishCapture {
  readonly published: Array<{
    organizationId: string
    projectId: string
    windowStartIso: string
    windowEndIso: string
  }>
  readonly publish: FanOutWeeklyRunPublish
}

const makePublishCapture = (): PublishCapture => {
  const published: PublishCapture["published"] = []
  return {
    published,
    publish: (payload) =>
      Effect.sync(() => {
        published.push({ ...payload })
      }),
  }
}

const makeReader = (
  listProjects: () => ReturnType<ClaudeCodeSpanReaderShape["listProjectsWithSpansInWindow"]>,
): ClaudeCodeSpanReaderShape => ({
  listProjectsWithSpansInWindow: listProjects,
  // Every other method dies — the fan-out only touches the one above.
  countSessionsForProjectInWindow: () => Effect.die("not used"),
  getTotalsForProject: () => Effect.die("not used"),
  getSessionDurationStats: () => Effect.die("not used"),
  getLocStats: () => Effect.die("not used"),
  getBiggestWrite: () => Effect.die("not used"),
  getToolMix: () => Effect.die("not used"),
  getTopFiles: () => Effect.die("not used"),
  getTopBashCommands: () => Effect.die("not used"),
  getTopWorkspaces: () => Effect.die("not used"),
  getTopBranches: () => Effect.die("not used"),
  getWorkspaceDeepDive: () => Effect.die("not used"),
  getHeatmap: () => Effect.die("not used"),
  getBusiestDay: () => Effect.die("not used"),
})

const makeLayer = (reader: ClaudeCodeSpanReaderShape) => {
  const chSqlClient: ChSqlClientShape = {
    organizationId: OrganizationId("system"),
    query: () => Effect.die("chSqlClient.query not used by the fake reader"),
    transaction: () => Effect.die("chSqlClient.transaction not used by the fake reader"),
  }
  return Layer.mergeAll(Layer.succeed(ClaudeCodeSpanReader, reader), Layer.succeed(ChSqlClient, chSqlClient))
}

const runFanOut = (reader: ClaudeCodeSpanReaderShape, publish: FanOutWeeklyRunPublish) =>
  Effect.runPromise(
    fanOutWeeklyRunUseCase({ publish })({ windowStart: WINDOW_START, windowEnd: WINDOW_END }).pipe(
      Effect.provide(makeLayer(reader)),
    ),
  )

describe("fanOutWeeklyRunUseCase", () => {
  it("returns no-activity when ClickHouse reports zero projects with spans", async () => {
    const reader = makeReader(() => Effect.succeed([]))
    const capture = makePublishCapture()

    const result = await runFanOut(reader, capture.publish)

    expect(result).toEqual({ status: "no-activity" })
    expect(capture.published).toHaveLength(0)
  })

  it("publishes for every project with spans", async () => {
    const reader = makeReader(() =>
      Effect.succeed([
        { organizationId: ORG_A, projectId: PROJECT_A },
        { organizationId: ORG_B, projectId: PROJECT_B },
        { organizationId: ORG_C, projectId: PROJECT_C },
      ]),
    )
    const capture = makePublishCapture()

    const result = await runFanOut(reader, capture.publish)

    expect(result).toEqual({ status: "fanned-out", publishedCount: 3 })
    const publishedPairs = capture.published.map((p) => `${p.organizationId}/${p.projectId}`).sort()
    expect(publishedPairs).toEqual([`${ORG_A}/${PROJECT_A}`, `${ORG_B}/${PROJECT_B}`, `${ORG_C}/${PROJECT_C}`].sort())
  })

  it("does NOT publish for orgs with no spans in window", async () => {
    const reader = makeReader(() => Effect.succeed([{ organizationId: ORG_A, projectId: PROJECT_A }]))
    const capture = makePublishCapture()

    const result = await runFanOut(reader, capture.publish)

    expect(result).toEqual({ status: "fanned-out", publishedCount: 1 })
    expect(capture.published).toEqual([
      {
        type: "claude_code",
        organizationId: ORG_A,
        projectId: PROJECT_A,
        windowStartIso: WINDOW_START.toISOString(),
        windowEndIso: WINDOW_END.toISOString(),
      },
    ])
  })

  it("propagates the window boundaries to each published payload (ISO 8601)", async () => {
    const reader = makeReader(() => Effect.succeed([{ organizationId: ORG_A, projectId: PROJECT_A }]))
    const capture = makePublishCapture()

    await runFanOut(reader, capture.publish)

    expect(capture.published[0]?.windowStartIso).toBe("2026-05-04T00:00:00.000Z")
    expect(capture.published[0]?.windowEndIso).toBe("2026-05-11T00:00:00.000Z")
  })
})
