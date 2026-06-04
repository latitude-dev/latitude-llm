import type { BillingOverrideRepository, StripeSubscriptionLookup } from "@domain/billing"
import type { OutboxEventWriter } from "@domain/events"
import type { MembershipRepository, OrganizationRepository } from "@domain/organizations"
import type { ProjectRepository } from "@domain/projects"
import {
  archiveSandboxUseCase,
  createSandboxUseCase,
  deleteSandboxUseCase,
  reactivateSandboxUseCase,
  SandboxAccessDeniedError,
  SandboxActiveCapReachedError,
  type SandboxRepository,
} from "@domain/sandboxes"
import { generateId, OrganizationId, type SettingsReader, type SqlClient, UserId } from "@domain/shared"
import { withTracing } from "@repo/observability"
import { eq } from "drizzle-orm"
import { Cause, Effect, Exit, Layer } from "effect"
import { beforeEach, describe, expect, it } from "vitest"
import { OutboxEventWriterLive } from "../outbox-writer.ts"
import { members, organizations, subscriptions, users } from "../schema/better-auth.ts"
import { projects } from "../schema/projects.ts"
import { sandboxes } from "../schema/sandboxes.ts"
import { setupTestPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { BillingOverrideRepositoryLive } from "./billing-override-repository.ts"
import { MembershipRepositoryLive } from "./membership-repository.ts"
import { OrganizationRepositoryLive } from "./organization-repository.ts"
import { ProjectRepositoryLive } from "./project-repository.ts"
import { SandboxRepositoryLive } from "./sandbox-repository.ts"
import { SettingsReaderLive } from "./settings-reader-repository.ts"
import { StripeSubscriptionLookupLive } from "./stripe-subscription-lookup.ts"

const pg = setupTestPostgres()

const sandboxLayers = Layer.mergeAll(
  SandboxRepositoryLive,
  OrganizationRepositoryLive,
  MembershipRepositoryLive,
  BillingOverrideRepositoryLive,
  StripeSubscriptionLookupLive,
  SettingsReaderLive,
  ProjectRepositoryLive,
  OutboxEventWriterLive,
)

type SandboxEnv =
  | SandboxRepository
  | OrganizationRepository
  | MembershipRepository
  | BillingOverrideRepository
  | StripeSubscriptionLookup
  | SettingsReader
  | ProjectRepository
  | OutboxEventWriter
  | SqlClient

// Sandbox lifecycle is cross-org management, so the use-cases run on the
// RLS-bypassing admin client scoped to the parent live org (the active org the
// user manages sandboxes from).
const runScoped = <A, E>(parentOrgId: OrganizationId, effect: Effect.Effect<A, E, SandboxEnv>) =>
  Effect.runPromise(effect.pipe(withPostgres(sandboxLayers, pg.adminPostgresClient, parentOrgId), withTracing))

const runScopedExit = <A, E>(parentOrgId: OrganizationId, effect: Effect.Effect<A, E, SandboxEnv>) =>
  Effect.runPromiseExit(effect.pipe(withPostgres(sandboxLayers, pg.adminPostgresClient, parentOrgId), withTracing))

interface ParentOrg {
  readonly parentOrgId: OrganizationId
  readonly memberUserId: UserId
}

const seedParentOrg = async (input?: { readonly plan?: "free" | "pro" }): Promise<ParentOrg> => {
  const parentOrgId = generateId()
  const memberUserId = generateId()

  await pg.db.insert(users).values({ id: memberUserId, name: "Member", email: `member-${memberUserId}@example.com` })
  await pg.db.insert(organizations).values({ id: parentOrgId, name: "Parent", slug: `parent-${parentOrgId}` })
  await pg.db
    .insert(members)
    .values({ id: generateId(), organizationId: parentOrgId, userId: memberUserId, role: "member" })

  if (input?.plan === "pro") {
    await pg.db.insert(subscriptions).values({
      id: generateId(),
      plan: "pro",
      referenceId: parentOrgId,
      stripeCustomerId: `cus_${parentOrgId}`,
      stripeSubscriptionId: `sub_${parentOrgId}`,
      status: "active",
      periodStart: new Date("2026-06-01T00:00:00.000Z"),
      periodEnd: new Date("2026-07-01T00:00:00.000Z"),
    })
  }

  return { parentOrgId: OrganizationId(parentOrgId), memberUserId: UserId(memberUserId) }
}

/** Directly seed an active/archived sandbox org + attrs row under a parent. */
const seedSandbox = async (parent: ParentOrg, status: "active" | "archived"): Promise<OrganizationId> => {
  const sandboxOrgId = generateId()
  await pg.db
    .insert(organizations)
    .values({ id: sandboxOrgId, name: "Sandbox", slug: `sandbox-${sandboxOrgId}`, parentOrgId: parent.parentOrgId })
  await pg.db
    .insert(sandboxes)
    .values({ id: generateId(), organizationId: sandboxOrgId, status, createdByUserId: parent.memberUserId })
  return OrganizationId(sandboxOrgId)
}

const failure = <A, E>(exit: Exit.Exit<A, E>): E | undefined =>
  Exit.isFailure(exit) ? exit.cause.reasons.find(Cause.isFailReason)?.error : undefined

describe("sandbox lifecycle use-cases", () => {
  beforeEach(async () => {
    await pg.db.delete(sandboxes)
    await pg.db.delete(subscriptions)
    await pg.db.delete(members)
    await pg.db.delete(organizations)
    await pg.db.delete(users)
  })

  it("createSandbox provisions a sandbox org and its attributes row", async () => {
    const parent = await seedParentOrg()

    const result = await runScoped(
      parent.parentOrgId,
      createSandboxUseCase({
        parentOrganizationId: parent.parentOrgId,
        actorUserId: parent.memberUserId,
        name: "Debug",
      }),
    )

    expect(result.organization.parentOrgId).toBe(parent.parentOrgId)
    expect(result.sandbox.organizationId).toBe(result.organization.id)
    expect(result.sandbox.status).toBe("active")
    expect(result.sandbox.createdByUserId).toBe(parent.memberUserId)

    const orgRows = await pg.db.select().from(organizations).where(eq(organizations.id, result.organization.id))
    expect(orgRows[0]?.parentOrgId).toBe(parent.parentOrgId)

    const sandboxRows = await pg.db.select().from(sandboxes).where(eq(sandboxes.organizationId, result.organization.id))
    expect(sandboxRows[0]?.status).toBe("active")
    expect(sandboxRows[0]?.createdByUserId).toBe(parent.memberUserId)
  })

  it("rejects creation for a non-member of the parent org", async () => {
    const parent = await seedParentOrg()
    const outsiderUserId = UserId(generateId())

    const exit = await runScopedExit(
      parent.parentOrgId,
      createSandboxUseCase({ parentOrganizationId: parent.parentOrgId, actorUserId: outsiderUserId, name: "Nope" }),
    )

    expect(failure(exit)).toBeInstanceOf(SandboxAccessDeniedError)
  })

  it("enforces the Free plan active cap of 1 and frees a slot on archive", async () => {
    const parent = await seedParentOrg()

    const first = await runScoped(
      parent.parentOrgId,
      createSandboxUseCase({ parentOrganizationId: parent.parentOrgId, actorUserId: parent.memberUserId, name: "One" }),
    )

    const secondExit = await runScopedExit(
      parent.parentOrgId,
      createSandboxUseCase({ parentOrganizationId: parent.parentOrgId, actorUserId: parent.memberUserId, name: "Two" }),
    )
    expect(failure(secondExit)).toBeInstanceOf(SandboxActiveCapReachedError)

    // Archiving frees the single slot.
    await runScoped(
      parent.parentOrgId,
      archiveSandboxUseCase({ sandboxOrganizationId: first.organization.id, actorUserId: parent.memberUserId }),
    )

    const third = await runScoped(
      parent.parentOrgId,
      createSandboxUseCase({
        parentOrganizationId: parent.parentOrgId,
        actorUserId: parent.memberUserId,
        name: "Three",
      }),
    )
    expect(third.sandbox.status).toBe("active")
  })

  it("allows up to the Pro plan active cap of 15", async () => {
    const parent = await seedParentOrg({ plan: "pro" })

    // Seed 14 active sandboxes directly, then a 15th via the use-case succeeds.
    for (let i = 0; i < 14; i++) {
      await seedSandbox(parent, "active")
    }
    const fifteenth = await runScoped(
      parent.parentOrgId,
      createSandboxUseCase({
        parentOrganizationId: parent.parentOrgId,
        actorUserId: parent.memberUserId,
        name: "Fifteen",
      }),
    )
    expect(fifteenth.sandbox.status).toBe("active")

    // The 16th exceeds the cap.
    const sixteenthExit = await runScopedExit(
      parent.parentOrgId,
      createSandboxUseCase({
        parentOrganizationId: parent.parentOrgId,
        actorUserId: parent.memberUserId,
        name: "Sixteen",
      }),
    )
    expect(failure(sixteenthExit)).toBeInstanceOf(SandboxActiveCapReachedError)
  })

  it("reactivates an archived sandbox only within the cap", async () => {
    const parent = await seedParentOrg()
    const archived = await seedSandbox(parent, "archived")

    // Free cap is 1 and there are no active sandboxes, so reactivation fits.
    const reactivated = await runScoped(
      parent.parentOrgId,
      reactivateSandboxUseCase({ sandboxOrganizationId: archived, actorUserId: parent.memberUserId }),
    )
    expect(reactivated.status).toBe("active")

    // Archive it again, fill the single slot with another active sandbox, and
    // reactivation must now be refused.
    await runScoped(
      parent.parentOrgId,
      archiveSandboxUseCase({ sandboxOrganizationId: archived, actorUserId: parent.memberUserId }),
    )
    await seedSandbox(parent, "active")

    const refusedExit = await runScopedExit(
      parent.parentOrgId,
      reactivateSandboxUseCase({ sandboxOrganizationId: archived, actorUserId: parent.memberUserId }),
    )
    expect(failure(refusedExit)).toBeInstanceOf(SandboxActiveCapReachedError)
  })

  it("deleteSandbox removes the org + attrs row and tears down the sandbox's projects", async () => {
    const parent = await seedParentOrg()
    const created = await runScoped(
      parent.parentOrgId,
      createSandboxUseCase({
        parentOrganizationId: parent.parentOrgId,
        actorUserId: parent.memberUserId,
        name: "Doomed",
      }),
    )
    const projectId = generateId()
    await pg.db.insert(projects).values({
      id: projectId,
      organizationId: created.organization.id,
      name: "Sandbox project",
      slug: "sandbox-project",
    })

    await runScoped(
      created.organization.id,
      deleteSandboxUseCase({ sandboxOrganizationId: created.organization.id, actorUserId: parent.memberUserId }),
    )

    const orgRows = await pg.db.select().from(organizations).where(eq(organizations.id, created.organization.id))
    expect(orgRows).toHaveLength(0)
    const sandboxRows = await pg.db
      .select()
      .from(sandboxes)
      .where(eq(sandboxes.organizationId, created.organization.id))
    expect(sandboxRows).toHaveLength(0)
    const projectRows = await pg.db.select().from(projects).where(eq(projects.id, projectId))
    expect(projectRows[0]?.deletedAt).not.toBeNull()
  })
})
