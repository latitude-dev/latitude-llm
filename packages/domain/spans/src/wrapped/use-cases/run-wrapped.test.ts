import { CLAUDE_CODE_WRAPPED_FLAG, FeatureFlagRepository } from "@domain/feature-flags"
import { createFakeFeatureFlagRepository } from "@domain/feature-flags/testing"
import {
  MembershipRepository,
  type MemberWithUser,
  type Organization,
  OrganizationRepository,
} from "@domain/organizations"
import { createFakeMembershipRepository } from "@domain/organizations/testing"
import { type Project, ProjectRepository } from "@domain/projects"
import {
  ChSqlClient,
  type ChSqlClientShape,
  MembershipId,
  NotFoundError,
  OrganizationId,
  ProjectId,
  SqlClient,
  UserId,
  type WrappedReportId,
} from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { beforeEach, describe, expect, it } from "vitest"
import type { WrappedReportRecord } from "../entities/wrapped-report-record.ts"
import { WrappedReportRepository } from "../ports/wrapped-report-repository.ts"
import {
  ClaudeCodeSpanReader,
  type ClaudeCodeSpanReaderShape,
} from "../types/claude-code/ports/claude-code-span-reader.ts"
import { runWrappedUseCase, type WrappedRenderedEmail } from "./run-wrapped.ts"

const ORG_ID = OrganizationId("org-cc-wrapped".padEnd(24, "x").slice(0, 24))
const PROJECT_ID = ProjectId("proj-cc-wrapped".padEnd(24, "x").slice(0, 24))
const ADMIN_USER_ID = UserId("user-cc-wrapped".padEnd(24, "x").slice(0, 24))

const WINDOW_START = new Date("2026-05-04T00:00:00.000Z")
const WINDOW_END = new Date("2026-05-11T00:00:00.000Z")

const makeMember = (suffix: string, email: string, emailVerified: boolean): MemberWithUser => ({
  id: MembershipId(`mem-${suffix}`.padEnd(24, "x").slice(0, 24)),
  organizationId: ORG_ID,
  userId: UserId(`u-${suffix}`.padEnd(24, "x").slice(0, 24)),
  role: "member",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  name: `User ${suffix}`,
  email,
  emailVerified,
  image: null,
})

const makeProject = (): Project => ({
  id: PROJECT_ID,
  organizationId: ORG_ID,
  name: "Test project",
  slug: "test-project",
  settings: null,
  firstTraceAt: null,
  deletedAt: null,
  lastEditedAt: new Date("2026-01-01T00:00:00.000Z"),
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
})

const makeReader = (overrides?: Partial<ClaudeCodeSpanReaderShape>): ClaudeCodeSpanReaderShape => ({
  listProjectsWithSpansInWindow: () => Effect.succeed([]),
  countSessionsForProjectInWindow: () => Effect.succeed(0),
  // The Wrapped build path exercises all of these on the happy path. They
  // return empty / zeroed defaults so the resulting Report is schema-valid
  // but doesn't drive any specific assertion.
  getTotalsForProject: () =>
    Effect.succeed({
      sessions: 0,
      toolCalls: 0,
      filesTouched: 0,
      commandsRun: 0,
      workspaces: 0,
      branches: 0,
      commits: 0,
      repos: 0,
      streakDays: 0,
      testsRun: 0,
      gitWriteOps: 0,
    }),
  getSessionDurationStats: () => Effect.succeed({ totalDurationMs: 0, longestDurationMs: 0, longestWorkspace: null }),
  getLocStats: () => Effect.succeed({ writeLines: 0, editAdded: 0, editRemoved: 0, readLines: 0 }),
  getBiggestWrite: () => Effect.succeed(null),
  getToolMix: () => Effect.succeed([]),
  getTopFiles: () => Effect.succeed([]),
  getTopBashCommands: () => Effect.succeed([]),
  getTopWorkspaces: () => Effect.succeed([]),
  getTopBranches: () => Effect.succeed([]),
  getWorkspaceDeepDive: () =>
    Effect.succeed({
      toolCalls: 0,
      sessions: 0,
      commits: 0,
      workspacePath: "",
      topFiles: [],
      topBranches: [],
      topBashCommands: [],
      dominantTool: null,
    }),
  getHeatmap: () => Effect.succeed([]),
  getBusiestDay: () => Effect.succeed(null),
  ...overrides,
})

const makeOrganization = (): Organization => ({
  id: ORG_ID,
  name: "Acme",
  slug: "acme",
  logo: null,
  metadata: null,
  settings: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
})

const makeOrganizationRepository = (organization: Organization): (typeof OrganizationRepository)["Service"] => ({
  findById: (id) =>
    id === organization.id
      ? Effect.succeed(organization)
      : Effect.fail(new NotFoundError({ entity: "Organization", id })),
  listByUserId: () => Effect.die("listByUserId not used"),
  save: () => Effect.die("save not used"),
  delete: () => Effect.die("delete not used"),
  countBySlug: () => Effect.die("countBySlug not used"),
})

const makeProjectRepository = (project: Project): (typeof ProjectRepository)["Service"] => ({
  findById: (id) =>
    id === project.id ? Effect.succeed(project) : Effect.fail(new NotFoundError({ entity: "Project", id })),
  findBySlug: () => Effect.die("findBySlug not used"),
  list: () => Effect.die("list not used"),
  listIncludingDeleted: () => Effect.die("listIncludingDeleted not used"),
  save: () => Effect.die("save not used"),
  softDelete: () => Effect.die("softDelete not used"),
  hardDelete: () => Effect.die("hardDelete not used"),
  existsByName: () => Effect.die("existsByName not used"),
  countBySlug: () => Effect.die("countBySlug not used"),
})

interface TestHarness {
  readonly layer: Layer.Layer<
    | FeatureFlagRepository
    | ClaudeCodeSpanReader
    | ProjectRepository
    | OrganizationRepository
    | MembershipRepository
    | WrappedReportRepository
    | SqlClient
    | ChSqlClient
  >
  readonly sent: Array<{ to: string; subject: string; html: string; text: string }>
  readonly saved: WrappedReportRecord[]
  readonly enableFlag: () => Promise<void>
}

const setupHarness = (options: {
  readonly members: readonly MemberWithUser[]
  readonly sessions: number
  readonly enableFlag: boolean
}): TestHarness => {
  const fakeFlags = createFakeFeatureFlagRepository()
  const { repository: memberships } = createFakeMembershipRepository({
    listMembersWithUser: () => Effect.succeed([...options.members]),
  })
  const projectRepo = makeProjectRepository(makeProject())
  const organizationRepo = makeOrganizationRepository(makeOrganization())
  const reader = makeReader({
    countSessionsForProjectInWindow: () => Effect.succeed(options.sessions),
  })
  const sqlClient = createFakeSqlClient({ organizationId: ORG_ID })
  // Stub ChSqlClient — the reader fake doesn't actually issue queries, but the
  // port's effect channel still requires the service tag.
  const chSqlClient: ChSqlClientShape = {
    organizationId: ORG_ID,
    query: () => Effect.die("chSqlClient.query not used"),
    transaction: () => Effect.die("chSqlClient.transaction not used"),
  }

  const saved: WrappedReportRecord[] = []
  const wrappedReportRepo: (typeof WrappedReportRepository)["Service"] = {
    save: (record) =>
      Effect.sync(() => {
        saved.push(record)
      }),
    findById: (id) => Effect.fail(new NotFoundError({ entity: "WrappedReport", id })),
    findLatestForProject: () => Effect.succeed(null),
  }

  const layer = Layer.mergeAll(
    Layer.succeed(FeatureFlagRepository, fakeFlags.repository),
    Layer.succeed(MembershipRepository, memberships),
    Layer.succeed(ProjectRepository, projectRepo),
    Layer.succeed(OrganizationRepository, organizationRepo),
    Layer.succeed(ClaudeCodeSpanReader, reader),
    Layer.succeed(WrappedReportRepository, wrappedReportRepo),
    Layer.succeed(SqlClient, sqlClient),
    Layer.succeed(ChSqlClient, chSqlClient),
  )

  return {
    layer,
    sent: [],
    saved,
    enableFlag: async () => {
      if (!options.enableFlag) return
      await Effect.runPromise(
        Effect.gen(function* () {
          yield* fakeFlags.repository.createFeatureFlag({ identifier: CLAUDE_CODE_WRAPPED_FLAG })
          yield* fakeFlags.repository.enableForOrganization({
            identifier: CLAUDE_CODE_WRAPPED_FLAG,
            enabledByAdminUserId: ADMIN_USER_ID,
          })
        }).pipe(Effect.provide(Layer.succeed(SqlClient, sqlClient))),
      )
    },
  }
}

const makeDeps = (sent: TestHarness["sent"]) => ({
  renderEmail: async ({
    userName,
    report,
    reportId,
  }: {
    userName: string
    report: { project: { name: string } }
    reportId: WrappedReportId
  }): Promise<WrappedRenderedEmail> => ({
    html: `<p>Hi ${userName}, your week in ${report.project.name}</p><a href="/wrapped/${reportId}">See it</a>`,
    subject: `Wrapped: ${report.project.name}`,
    text: `Hi ${userName}, your week in ${report.project.name} — /wrapped/${reportId}`,
  }),
  sendEmail: (email: { to: string; subject: string; html: string; text: string }) =>
    Effect.sync(() => {
      sent.push(email)
    }),
})

describe("runWrappedUseCase", () => {
  let harness: TestHarness
  let sent: TestHarness["sent"]

  beforeEach(() => {
    sent = []
  })

  it("skips when the feature flag is off", async () => {
    harness = setupHarness({
      members: [makeMember("a", "a@test.com", true)],
      sessions: 42,
      enableFlag: false,
    })

    const result = await Effect.runPromise(
      runWrappedUseCase(makeDeps(sent))({
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        windowStart: WINDOW_START,
        windowEnd: WINDOW_END,
      }).pipe(Effect.provide(harness.layer)),
    )

    expect(result).toEqual({ status: "skipped", reason: "flag-off" })
    expect(sent).toHaveLength(0)
  })

  it("skips when there is no Claude Code activity in the window", async () => {
    harness = setupHarness({
      members: [makeMember("a", "a@test.com", true)],
      sessions: 0,
      enableFlag: true,
    })
    await harness.enableFlag()

    const result = await Effect.runPromise(
      runWrappedUseCase(makeDeps(sent))({
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        windowStart: WINDOW_START,
        windowEnd: WINDOW_END,
      }).pipe(Effect.provide(harness.layer)),
    )

    expect(result).toEqual({ status: "skipped", reason: "no-activity" })
    expect(sent).toHaveLength(0)
  })

  it("skips when no member has a verified email", async () => {
    harness = setupHarness({
      members: [makeMember("a", "a@test.com", false), makeMember("b", "b@test.com", false)],
      sessions: 7,
      enableFlag: true,
    })
    await harness.enableFlag()

    const result = await Effect.runPromise(
      runWrappedUseCase(makeDeps(sent))({
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        windowStart: WINDOW_START,
        windowEnd: WINDOW_END,
      }).pipe(Effect.provide(harness.layer)),
    )

    expect(result).toEqual({ status: "skipped", reason: "no-recipients" })
    expect(sent).toHaveLength(0)
  })

  it("sends one email to every verified recipient", async () => {
    harness = setupHarness({
      members: [
        makeMember("a", "alice@test.com", true),
        makeMember("b", "bob@test.com", true),
        makeMember("c", "charlie@test.com", false),
      ],
      sessions: 12,
      enableFlag: true,
    })
    await harness.enableFlag()

    const result = await Effect.runPromise(
      runWrappedUseCase(makeDeps(sent))({
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        windowStart: WINDOW_START,
        windowEnd: WINDOW_END,
      }).pipe(Effect.provide(harness.layer)),
    )

    expect(result.status).toBe("sent")
    if (result.status !== "sent") throw new Error("unreachable")
    expect(result.recipientCount).toBe(2)
    expect(result.projectName).toBe("Test project")
    expect(typeof result.reportId).toBe("string")
    expect(result.reportId.length).toBeGreaterThan(0)
    expect(sent.map((e) => e.to).sort()).toEqual(["alice@test.com", "bob@test.com"])
    for (const email of sent) {
      expect(email.subject).toBe("Wrapped: Test project")
      expect(email.html).toContain("Test project")
      expect(email.html).toContain(`/wrapped/${result.reportId}`)
    }
    // The report was persisted exactly once before the emails went out.
    expect(harness.saved).toHaveLength(1)
    expect(harness.saved[0]?.id).toBe(result.reportId)
    expect(harness.saved[0]?.organizationId).toBe(ORG_ID)
    expect(harness.saved[0]?.projectId).toBe(PROJECT_ID)
  })

  it("uses the org owner's name for the persisted ownerName (web greeting); the email still gets the recipient's name", async () => {
    harness = setupHarness({
      members: [
        { ...makeMember("a", "owner@test.com", true), role: "owner", name: "Alex Owner" },
        makeMember("b", "bob@test.com", true),
      ],
      sessions: 5,
      enableFlag: true,
    })
    await harness.enableFlag()

    await Effect.runPromise(
      runWrappedUseCase(makeDeps(sent))({
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        windowStart: WINDOW_START,
        windowEnd: WINDOW_END,
      }).pipe(Effect.provide(harness.layer)),
    )

    expect(harness.saved[0]?.ownerName).toBe("Alex Owner")
  })

  it("uses the org owner's name even when the owner has no verified email", async () => {
    // Regression: the persisted owner_name was previously resolved from the
    // email-verified subset, so an unverified owner would silently fall
    // back to the org name on the public report's greeting.
    harness = setupHarness({
      members: [
        { ...makeMember("a", "owner@test.com", false), role: "owner", name: "Alex Owner" },
        makeMember("b", "bob@test.com", true),
      ],
      sessions: 5,
      enableFlag: true,
    })
    await harness.enableFlag()

    await Effect.runPromise(
      runWrappedUseCase(makeDeps(sent))({
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        windowStart: WINDOW_START,
        windowEnd: WINDOW_END,
      }).pipe(Effect.provide(harness.layer)),
    )

    expect(harness.saved[0]?.ownerName).toBe("Alex Owner")
  })

  it("falls back to the org name when no owner is in the member list", async () => {
    harness = setupHarness({
      members: [makeMember("b", "bob@test.com", true)],
      sessions: 5,
      enableFlag: true,
    })
    await harness.enableFlag()

    await Effect.runPromise(
      runWrappedUseCase(makeDeps(sent))({
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        windowStart: WINDOW_START,
        windowEnd: WINDOW_END,
      }).pipe(Effect.provide(harness.layer)),
    )

    expect(harness.saved[0]?.ownerName).toBe("Acme")
  })
})
