import { CLAUDE_CODE_WRAPPED_FLAG, FeatureFlagRepository } from "@domain/feature-flags"
import { createFakeFeatureFlagRepository } from "@domain/feature-flags/testing"
import { MembershipRepository, type MemberWithUser } from "@domain/organizations"
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
} from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { beforeEach, describe, expect, it } from "vitest"
import { ClaudeCodeSpanReader, type ClaudeCodeSpanReaderShape } from "../ports/claude-code-span-reader.ts"
import { type ClaudeCodeWrappedRenderedEmail, runClaudeCodeWrappedUseCase } from "./run-claude-code-wrapped.ts"

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
  ...overrides,
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
    FeatureFlagRepository | ClaudeCodeSpanReader | ProjectRepository | MembershipRepository | SqlClient | ChSqlClient
  >
  readonly sent: Array<{ to: string; subject: string; html: string; text: string }>
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

  const layer = Layer.mergeAll(
    Layer.succeed(FeatureFlagRepository, fakeFlags.repository),
    Layer.succeed(MembershipRepository, memberships),
    Layer.succeed(ProjectRepository, projectRepo),
    Layer.succeed(ClaudeCodeSpanReader, reader),
    Layer.succeed(SqlClient, sqlClient),
    Layer.succeed(ChSqlClient, chSqlClient),
  )

  return {
    layer,
    sent: [],
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
  }: {
    userName: string
    report: { projectName: string }
  }): Promise<ClaudeCodeWrappedRenderedEmail> => ({
    html: `<p>Hi ${userName}, your week in ${report.projectName}</p>`,
    subject: `Wrapped: ${report.projectName}`,
    text: `Hi ${userName}, your week in ${report.projectName}`,
  }),
  sendEmail: (email: { to: string; subject: string; html: string; text: string }) =>
    Effect.sync(() => {
      sent.push(email)
    }),
})

describe("runClaudeCodeWrappedUseCase", () => {
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
      runClaudeCodeWrappedUseCase(makeDeps(sent))({
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
      runClaudeCodeWrappedUseCase(makeDeps(sent))({
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
      runClaudeCodeWrappedUseCase(makeDeps(sent))({
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
      runClaudeCodeWrappedUseCase(makeDeps(sent))({
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        windowStart: WINDOW_START,
        windowEnd: WINDOW_END,
      }).pipe(Effect.provide(harness.layer)),
    )

    expect(result).toEqual({ status: "sent", recipientCount: 2 })
    expect(sent.map((e) => e.to).sort()).toEqual(["alice@test.com", "bob@test.com"])
    for (const email of sent) {
      expect(email.subject).toBe("Wrapped: Test project")
      expect(email.html).toContain("Test project")
    }
  })
})
