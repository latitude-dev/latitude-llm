import { type AdminFeatureFlagEligibility, AdminFeatureFlagRepository } from "@domain/admin"
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

const makeAdminFlags = (eligibility: AdminFeatureFlagEligibility): (typeof AdminFeatureFlagRepository)["Service"] => ({
  findEligibilityForFlag: () => Effect.succeed(eligibility),
  list: () => Effect.die("not used"),
  listArchived: () => Effect.die("not used"),
  create: () => Effect.die("not used"),
  update: () => Effect.die("not used"),
  archive: () => Effect.die("not used"),
  unarchive: () => Effect.die("not used"),
  delete: () => Effect.die("not used"),
  enableForAll: () => Effect.die("not used"),
  disableForAll: () => Effect.die("not used"),
  listForOrganization: () => Effect.die("not used"),
  enableForOrganization: () => Effect.die("not used"),
  disableForOrganization: () => Effect.die("not used"),
})

const makeLayer = (reader: ClaudeCodeSpanReaderShape, adminFlags: (typeof AdminFeatureFlagRepository)["Service"]) => {
  const chSqlClient: ChSqlClientShape = {
    organizationId: OrganizationId("system"),
    query: () => Effect.die("chSqlClient.query not used by the fake reader"),
    transaction: () => Effect.die("chSqlClient.transaction not used by the fake reader"),
  }
  return Layer.mergeAll(
    Layer.succeed(ClaudeCodeSpanReader, reader),
    Layer.succeed(AdminFeatureFlagRepository, adminFlags),
    Layer.succeed(ChSqlClient, chSqlClient),
  )
}

const runFanOut = (
  reader: ClaudeCodeSpanReaderShape,
  adminFlags: (typeof AdminFeatureFlagRepository)["Service"],
  publish: FanOutWeeklyRunPublish,
) =>
  Effect.runPromise(
    fanOutWeeklyRunUseCase({ publish })({ windowStart: WINDOW_START, windowEnd: WINDOW_END }).pipe(
      Effect.provide(makeLayer(reader, adminFlags)),
    ),
  )

describe("fanOutWeeklyRunUseCase", () => {
  it("returns no-activity when ClickHouse reports zero projects with spans", async () => {
    const reader = makeReader(() => Effect.succeed([]))
    const adminFlags = makeAdminFlags({ enabledForAll: false, organizationIds: [] })
    const capture = makePublishCapture()

    const result = await runFanOut(reader, adminFlags, capture.publish)

    expect(result).toEqual({ status: "no-activity" })
    expect(capture.published).toHaveLength(0)
  })

  it("returns no-eligible-orgs when projects exist but no org has the flag enabled", async () => {
    const reader = makeReader(() =>
      Effect.succeed([
        { organizationId: ORG_A, projectId: PROJECT_A },
        { organizationId: ORG_B, projectId: PROJECT_B },
      ]),
    )
    const adminFlags = makeAdminFlags({ enabledForAll: false, organizationIds: [] })
    const capture = makePublishCapture()

    const result = await runFanOut(reader, adminFlags, capture.publish)

    expect(result).toEqual({ status: "no-eligible-orgs" })
    expect(capture.published).toHaveLength(0)
  })

  it("publishes only for the intersection of (has spans) ∩ (org flag enabled)", async () => {
    // Three projects with spans across three orgs; only A and C are
    // flag-enabled. Expect B to be filtered out.
    const reader = makeReader(() =>
      Effect.succeed([
        { organizationId: ORG_A, projectId: PROJECT_A },
        { organizationId: ORG_B, projectId: PROJECT_B },
        { organizationId: ORG_C, projectId: PROJECT_C },
      ]),
    )
    const adminFlags = makeAdminFlags({ enabledForAll: false, organizationIds: [ORG_A, ORG_C] })
    const capture = makePublishCapture()

    const result = await runFanOut(reader, adminFlags, capture.publish)

    expect(result).toEqual({ status: "fanned-out", publishedCount: 2 })
    const publishedPairs = capture.published.map((p) => `${p.organizationId}/${p.projectId}`).sort()
    expect(publishedPairs).toEqual([`${ORG_A}/${PROJECT_A}`, `${ORG_C}/${PROJECT_C}`].sort())
  })

  it("publishes for every project when the flag is enabled globally", async () => {
    // `enabledForAll: true` means we ignore organizationIds entirely — every
    // project from the spans query gets a runForProject task.
    const reader = makeReader(() =>
      Effect.succeed([
        { organizationId: ORG_A, projectId: PROJECT_A },
        { organizationId: ORG_B, projectId: PROJECT_B },
        { organizationId: ORG_C, projectId: PROJECT_C },
      ]),
    )
    const adminFlags = makeAdminFlags({ enabledForAll: true, organizationIds: [] })
    const capture = makePublishCapture()

    const result = await runFanOut(reader, adminFlags, capture.publish)

    expect(result).toEqual({ status: "fanned-out", publishedCount: 3 })
    expect(capture.published).toHaveLength(3)
  })

  it("does NOT publish for orgs that have the flag enabled but no spans in window", async () => {
    // Org B is flag-enabled but never appears in the spans query, so it must
    // not get a runForProject task — defending the "only projects with
    // Claude Code activity get emails" contract.
    const reader = makeReader(() => Effect.succeed([{ organizationId: ORG_A, projectId: PROJECT_A }]))
    const adminFlags = makeAdminFlags({ enabledForAll: false, organizationIds: [ORG_A, ORG_B] })
    const capture = makePublishCapture()

    const result = await runFanOut(reader, adminFlags, capture.publish)

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
    const adminFlags = makeAdminFlags({ enabledForAll: true, organizationIds: [] })
    const capture = makePublishCapture()

    await runFanOut(reader, adminFlags, capture.publish)

    expect(capture.published[0]?.windowStartIso).toBe("2026-05-04T00:00:00.000Z")
    expect(capture.published[0]?.windowEndIso).toBe("2026-05-11T00:00:00.000Z")
  })
})
