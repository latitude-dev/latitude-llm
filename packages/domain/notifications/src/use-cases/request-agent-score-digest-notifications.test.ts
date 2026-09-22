import { type AgentScoreSnapshot, AgentScoreSnapshotRepository } from "@domain/agent-score"
import { type Membership, MembershipRepository, type MemberWithUser } from "@domain/organizations"
import { OrganizationId, ProjectId, SCORE_DIMENSIONS, SqlClient, UserId } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { requestAgentScoreDigestNotificationsUseCase } from "./request-agent-score-digest-notifications.ts"

const cuid = (seed: string) => seed.padEnd(24, "0")

const ORG = OrganizationId(cuid("o"))
const PROJECT = ProjectId(cuid("p"))
const WINDOW = { windowStart: "2026-09-16", windowEnd: "2026-09-22" }

const dimensions = (score: number) =>
  Object.fromEntries(
    SCORE_DIMENSIONS.map((dimension) => [dimension, { score, interval: { lower: score - 2, upper: score + 2 } }]),
  ) as AgentScoreSnapshot["dimensions"]

const snapshot = (date: string, score: number): AgentScoreSnapshot => ({
  organizationId: ORG,
  projectId: PROJECT,
  date,
  scoringVersion: "agent-score-v5-provisional",
  windowDays: 7,
  eligibleSessionCount: 120,
  score,
  interval: { lower: score - 1, upper: score + 1 },
  dimensions: dimensions(score),
  createdAt: new Date(`${date}T04:00:00.000Z`),
})

function setup(options: {
  readonly snapshots?: readonly AgentScoreSnapshot[]
  readonly memberUserIds?: readonly string[]
}) {
  const memberUserIds = options.memberUserIds ?? [cuid("ua"), cuid("ub")]
  const members: MemberWithUser[] = memberUserIds.map((uid, i) => ({
    id: cuid(`m${i}`) as Membership["id"],
    organizationId: ORG,
    userId: uid,
    role: "member",
    createdAt: new Date(),
    name: null,
    email: `${uid}@test.com`,
    emailVerified: true,
    image: null,
  }))

  const memberships = MembershipRepository.of({
    findById: () => Effect.die("not used"),
    findFirstOwner: () => Effect.die("not used"),
    listByOrganizationId: () =>
      Effect.succeed(
        members.map(
          (m): Membership => ({
            id: m.id as Membership["id"],
            organizationId: m.organizationId as Membership["organizationId"],
            userId: UserId(m.userId),
            role: "member",
            createdAt: m.createdAt,
          }),
        ),
      ),
    listByUserId: () => Effect.succeed([]),
    findByOrganizationAndUser: () => Effect.die("not used"),
    listMembersWithUser: () => Effect.succeed(members),
    findByIdWithUser: () => Effect.die("not used"),
    findMemberByEmail: () => Effect.succeed(false),
    isMember: () => Effect.succeed(true),
    isAdmin: () => Effect.succeed(false),
    save: () => Effect.die("not used"),
    delete: () => Effect.die("not used"),
  })

  const snapshots = AgentScoreSnapshotRepository.of({
    insertIfAbsent: () => Effect.die("not used"),
    findByDate: () => Effect.die("not used"),
    findLatest: () => Effect.die("not used"),
    listHistory: () => Effect.succeed(options.snapshots ?? []),
  })

  return Layer.mergeAll(
    Layer.succeed(MembershipRepository, memberships),
    Layer.succeed(AgentScoreSnapshotRepository, snapshots),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: ORG })),
  )
}

const run = (layer: ReturnType<typeof setup>) =>
  Effect.runPromise(
    requestAgentScoreDigestNotificationsUseCase({ organizationId: ORG, projectId: PROJECT, ...WINDOW }).pipe(
      Effect.provide(layer),
    ),
  )

describe("requestAgentScoreDigestNotificationsUseCase", () => {
  it("emits one request per org member, all sharing the week's idempotency key", async () => {
    const result = await run(
      setup({
        snapshots: [snapshot("2026-09-17", 60), snapshot("2026-09-21", 70)],
        memberUserIds: [cuid("ua"), cuid("ub"), cuid("uc")],
      }),
    )

    expect(result.status).toBe("ok")
    if (result.status !== "ok") throw new Error("unreachable")
    expect(result.requests).toHaveLength(3)
    for (const request of result.requests) {
      expect(request.kind).toBe("agent-score.weekly-digest")
      expect(request.idempotencyKey).toBe(`agent-score.weekly-digest:${PROJECT}:2026-09-22`)
      expect(request.projectId).toBe(PROJECT)
    }
    expect(new Set(result.requests.map((request) => request.notificationId)).size).toBe(3)
  })

  it("carries the fold of the window onto the payload", async () => {
    const result = await run(setup({ snapshots: [snapshot("2026-09-17", 60), snapshot("2026-09-21", 70)] }))

    expect(result.status).toBe("ok")
    if (result.status !== "ok") throw new Error("unreachable")
    const payload = result.requests[0]?.payload
    expect(payload).toMatchObject({
      projectId: PROJECT,
      date: "2026-09-21",
      score: 70,
      publishedDayCount: 2,
      windowStart: "2026-09-16",
      windowEnd: "2026-09-22",
      comparison: { status: "comparable", baselineDate: "2026-09-17", baselineScore: 60, delta: 10 },
    })
  })

  it("skips a project whose window turned out to hold no score", async () => {
    const result = await run(setup({ snapshots: [] }))

    expect(result).toEqual({ status: "skipped", reason: "no-score" })
  })

  it("skips when the organization has no members left to notify", async () => {
    const result = await run(setup({ snapshots: [snapshot("2026-09-21", 70)], memberUserIds: [] }))

    expect(result).toEqual({ status: "skipped", reason: "no-recipients" })
  })
})
