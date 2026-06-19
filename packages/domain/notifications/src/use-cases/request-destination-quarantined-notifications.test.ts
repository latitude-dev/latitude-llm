import { type Membership, MembershipRepository, type MembershipRole } from "@domain/organizations"
import { createFakeMembershipRepository } from "@domain/organizations/testing"
import { OrganizationId, ProjectId, type ProjectSettings, SettingsReader, SqlClient, UserId } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { requestDestinationQuarantinedNotificationsUseCase } from "./request-destination-quarantined-notifications.ts"

const cuid = (seed: string) => seed.padEnd(24, "0")

const orgId = OrganizationId(cuid("o"))
const projectId = ProjectId(cuid("p"))
const destinationId = cuid("d")
const quarantinedAt = "2026-06-17T10:00:00.000Z"

const member = (uid: string): Membership => ({
  id: cuid(`m${uid}`) as Membership["id"],
  organizationId: orgId as Membership["organizationId"],
  userId: UserId(cuid(uid)),
  role: "member" as MembershipRole,
  createdAt: new Date("2026-01-01T00:00:00Z"),
})

const makeLayer = (opts: { projectSettings?: ProjectSettings | null; members?: readonly Membership[] } = {}) => {
  const { repository } = createFakeMembershipRepository({
    listByOrganizationId: () => Effect.succeed([...(opts.members ?? [member("u1"), member("u2")])]),
  })
  const settings = SettingsReader.of({
    getOrganizationSettings: () => Effect.succeed(null),
    getProjectSettings: () => Effect.succeed(opts.projectSettings ?? null),
  })
  return Layer.mergeAll(
    Layer.succeed(MembershipRepository, repository),
    Layer.succeed(SettingsReader, settings),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: orgId })),
  )
}

const input = {
  organizationId: orgId,
  projectId,
  destinationId,
  destinationName: "Production PostHog",
  destinationKind: "posthog",
  quarantinedAt,
  failureMessage: "[401] invalid_api_key",
}

describe("requestDestinationQuarantinedNotificationsUseCase", () => {
  it("fans out one request per org member with the project anchor + snapshot payload", async () => {
    const result = await Effect.runPromise(
      requestDestinationQuarantinedNotificationsUseCase(input).pipe(Effect.provide(makeLayer())),
    )

    expect(result.status).toBe("ok")
    if (result.status !== "ok") throw new Error("unreachable")

    expect(result.requests).toHaveLength(2)
    const [first] = result.requests
    if (!first) throw new Error("expected a request")
    expect(first.kind).toBe("destination.quarantined")
    expect(first.projectId).toBe(projectId)
    expect(first.idempotencyKey).toBe(`destination.quarantined:${destinationId}:${quarantinedAt}`)
    expect(first.payload).toEqual({
      destinationId,
      destinationName: "Production PostHog",
      destinationKind: "posthog",
      quarantinedAt,
      failureMessage: "[401] invalid_api_key",
    })
    // All recipients share the per-occurrence idempotency key.
    expect(new Set(result.requests.map((r) => r.idempotencyKey)).size).toBe(1)
  })

  it("keys idempotency per occurrence: redelivery replays, re-quarantine mints a new key", async () => {
    const run = (at: string) =>
      Effect.runPromise(
        requestDestinationQuarantinedNotificationsUseCase({ ...input, quarantinedAt: at }).pipe(
          Effect.provide(makeLayer()),
        ),
      )
    const first = await run(quarantinedAt)
    const redelivered = await run(quarantinedAt)
    const reQuarantined = await run("2026-06-18T09:00:00.000Z")
    if (first.status !== "ok" || redelivered.status !== "ok" || reQuarantined.status !== "ok") {
      throw new Error("expected ok")
    }
    expect(redelivered.requests[0]?.idempotencyKey).toBe(first.requests[0]?.idempotencyKey)
    expect(reQuarantined.requests[0]?.idempotencyKey).not.toBe(first.requests[0]?.idempotencyKey)
  })

  it("respects the project-level gate (quarantine off → skipped)", async () => {
    const result = await Effect.runPromise(
      requestDestinationQuarantinedNotificationsUseCase(input).pipe(
        Effect.provide(makeLayer({ projectSettings: { notifications: { destinations: { quarantine: false } } } })),
      ),
    )
    expect(result).toEqual({ status: "skipped", reason: "project-gate-off" })
  })

  it("skips when the org has no members", async () => {
    const result = await Effect.runPromise(
      requestDestinationQuarantinedNotificationsUseCase(input).pipe(Effect.provide(makeLayer({ members: [] }))),
    )
    expect(result).toEqual({ status: "skipped", reason: "no-recipients" })
  })
})
