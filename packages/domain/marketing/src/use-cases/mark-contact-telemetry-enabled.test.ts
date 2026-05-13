import { MembershipRepository, type MemberWithUser } from "@domain/organizations"
import { createFakeMembershipRepository } from "@domain/organizations/testing"
import { MembershipId, OrganizationId, SqlClient, UserId } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type {
  MarketingContactsPort,
  MarketingCreateContactInput,
  MarketingUpdateContactInput,
} from "../ports/marketing-contacts.ts"
import { markContactTelemetryEnabled } from "./mark-contact-telemetry-enabled.ts"

const ORG = OrganizationId("orgxxxxxxxxxxxxxxxxxxxxx")
const USER_OWNER = UserId("user-ownerxxxxxxxxxxxxxx")
const USER_OLDEST = UserId("user-oldestxxxxxxxxxxxxx")
const USER_NEWEST = UserId("user-newestxxxxxxxxxxxxx")

const OLDEST_AT = new Date("2025-06-01T12:00:00.000Z")
const MIDDLE_AT = new Date("2025-07-01T12:00:00.000Z")
const NEWEST_AT = new Date("2025-08-01T12:00:00.000Z")

interface FakeSender extends MarketingContactsPort {
  readonly creates: MarketingCreateContactInput[]
  readonly updates: MarketingUpdateContactInput[]
}

const createFakeSender = (): FakeSender => {
  const creates: MarketingCreateContactInput[] = []
  const updates: MarketingUpdateContactInput[] = []
  return {
    creates,
    updates,
    createContact: (input) =>
      Effect.sync(() => {
        creates.push(input)
      }),
    updateContact: (input) =>
      Effect.sync(() => {
        updates.push(input)
      }),
  }
}

const member = (userId: UserId, role: string, createdAt: Date, email: string, suffix: string): MemberWithUser => ({
  id: MembershipId(`mem-${suffix}`.padEnd(24, "x").slice(0, 24)),
  organizationId: ORG,
  userId,
  role,
  createdAt,
  email,
  emailVerified: true,
  name: null,
  image: null,
})

const buildLayers = (members: readonly MemberWithUser[]) => {
  const { repository } = createFakeMembershipRepository({
    listMembersWithUser: () => Effect.succeed([...members]),
  })
  const sqlClient = createFakeSqlClient()
  return Layer.mergeAll(Layer.succeed(MembershipRepository, repository), Layer.succeed(SqlClient, sqlClient))
}

describe("markContactTelemetryEnabled", () => {
  it("updates every member of the org with telemetryEnabled=true", async () => {
    const layers = buildLayers([
      member(USER_OLDEST, "member", OLDEST_AT, "oldest@example.com", "oldest"),
      member(USER_OWNER, "owner", MIDDLE_AT, "owner@example.com", "owner"),
      member(USER_NEWEST, "member", NEWEST_AT, "newest@example.com", "newest"),
    ])
    const sender = createFakeSender()

    await Effect.runPromise(
      markContactTelemetryEnabled({ marketingContacts: sender })({ organizationId: ORG }).pipe(Effect.provide(layers)),
    )

    expect(sender.updates).toHaveLength(3)
    expect(new Set(sender.updates.map((u) => u.userId))).toEqual(new Set([USER_OLDEST, USER_OWNER, USER_NEWEST]))
    expect(new Set(sender.updates.map((u) => u.email))).toEqual(
      new Set(["oldest@example.com", "owner@example.com", "newest@example.com"]),
    )
    for (const update of sender.updates) {
      expect(update.telemetryEnabled).toBe(true)
    }
  })

  it("is a no-op when the org has no members at all", async () => {
    const layers = buildLayers([])
    const sender = createFakeSender()

    await Effect.runPromise(
      markContactTelemetryEnabled({ marketingContacts: sender })({ organizationId: ORG }).pipe(Effect.provide(layers)),
    )

    expect(sender.updates).toHaveLength(0)
  })
})
