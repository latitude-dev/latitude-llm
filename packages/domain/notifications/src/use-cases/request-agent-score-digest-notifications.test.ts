import { type Membership, MembershipRepository, type MemberWithUser } from "@domain/organizations"
import { OrganizationId, ProjectId, SqlClient, UserId } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import {
  requestAgentScoreDigestNotificationsUseCase,
  type WeeklyAgentScoreDigestInput,
} from "./request-agent-score-digest-notifications.ts"

const cuid = (seed: string) => seed.padEnd(24, "0")

const ORG = OrganizationId(cuid("o"))
const PROJECT = ProjectId(cuid("p"))

const digest = (overrides: Partial<WeeklyAgentScoreDigestInput> = {}): WeeklyAgentScoreDigestInput => ({
  date: "2026-09-21",
  windowStart: "2026-09-16",
  windowEnd: "2026-09-22",
  score: 70,
  interval: { lower: 68, upper: 72 },
  scoringVersion: "agent-score-v5-provisional",
  windowDays: 7,
  eligibleSessionCount: 120,
  publishedDayCount: 2,
  dimensions: {
    outcome: { score: 74, delta: 2 },
    reliability: { score: 81, delta: 0 },
    cost: { score: 66, delta: -1 },
    speed: { score: 70, delta: 3 },
    safety: { score: 92, delta: null },
  },
  comparison: {
    status: "comparable",
    baselineDate: "2026-09-17",
    baselineScore: 60,
    delta: 10,
    significant: true,
  },
  ...overrides,
})

function setup(memberUserIds: readonly string[] = [cuid("ua"), cuid("ub")]) {
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

  return Layer.mergeAll(
    Layer.succeed(MembershipRepository, memberships),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: ORG })),
  )
}

const run = (layer: ReturnType<typeof setup>, input: WeeklyAgentScoreDigestInput = digest()) =>
  Effect.runPromise(
    requestAgentScoreDigestNotificationsUseCase({ organizationId: ORG, projectId: PROJECT, digest: input }).pipe(
      Effect.provide(layer),
    ),
  )

describe("requestAgentScoreDigestNotificationsUseCase", () => {
  it("emits one request per org member, all sharing the week's idempotency key", async () => {
    const result = await run(setup([cuid("ua"), cuid("ub"), cuid("uc")]))

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

  it("anchors the digest to its project on the payload", async () => {
    const result = await run(setup())

    expect(result.status).toBe("ok")
    if (result.status !== "ok") throw new Error("unreachable")
    expect(result.requests[0]?.payload).toMatchObject({
      projectId: PROJECT,
      date: "2026-09-21",
      score: 70,
      publishedDayCount: 2,
      comparison: { status: "comparable", delta: 10, significant: true },
    })
  })

  it("keys two projects digesting the same week apart", async () => {
    const first = await run(setup())
    const second = await Effect.runPromise(
      requestAgentScoreDigestNotificationsUseCase({
        organizationId: ORG,
        projectId: ProjectId(cuid("p2")),
        digest: digest(),
      }).pipe(Effect.provide(setup())),
    )

    expect(first.status).toBe("ok")
    expect(second.status).toBe("ok")
    if (first.status !== "ok" || second.status !== "ok") throw new Error("unreachable")
    expect(first.requests[0]?.idempotencyKey).not.toBe(second.requests[0]?.idempotencyKey)
  })

  it("skips when the organization has no members left to notify", async () => {
    expect(await run(setup([]))).toEqual({ status: "skipped", reason: "no-recipients" })
  })
})
