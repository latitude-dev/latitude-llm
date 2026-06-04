import { BillingOverrideRepository, StripeSubscriptionLookup } from "@domain/billing"
import { createFakeBillingOverrideRepository, createFakeStripeSubscriptionLookup } from "@domain/billing/testing"
import { createOrganization, MembershipRepository, OrganizationRepository } from "@domain/organizations"
import { createFakeMembershipRepository, createFakeOrganizationRepository } from "@domain/organizations/testing"
import { generateId, OrganizationId, SettingsReader, SqlClient, UserId } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Cause, Effect, Exit, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { createSandbox } from "../entities/sandbox.ts"
import { SandboxAccessDeniedError, SandboxActiveCapReachedError } from "../errors.ts"
import { SandboxRepository } from "../ports/sandbox-repository.ts"
import { createFakeSandboxRepository } from "../testing/fake-sandbox-repository.ts"
import { archiveSandboxUseCase } from "./archive-sandbox.ts"
import { createSandboxUseCase } from "./create-sandbox.ts"
import { reactivateSandboxUseCase } from "./reactivate-sandbox.ts"

const PARENT_ORG_ID = OrganizationId(generateId())
const ADMIN_USER_ID = UserId(generateId())

const failure = <A, E>(exit: Exit.Exit<A, E>): E | undefined =>
  Exit.isFailure(exit) ? exit.cause.reasons.find(Cause.isFailReason)?.error : undefined

/**
 * Wire every sandbox-use-case dependency with in-memory fakes. The actor is a
 * member of the parent org and the plan is Free (no override/subscription) →
 * active cap of 1, unless `plan: "pro"` is passed.
 */
const buildLayer = (input?: {
  readonly plan?: "pro"
  readonly isMember?: boolean
  readonly seedSandbox?: { readonly organizationId: OrganizationId; readonly status: "active" | "archived" }
}) => {
  const sandbox = createFakeSandboxRepository()
  const organization = createFakeOrganizationRepository()
  const membership = createFakeMembershipRepository({
    isMember: () => Effect.succeed(input?.isMember ?? true),
  })
  const override = createFakeBillingOverrideRepository()
  const subscription = createFakeStripeSubscriptionLookup()

  if (input?.plan === "pro") {
    subscription.subscriptionsByOrganizationId.set(String(PARENT_ORG_ID), {
      plan: "pro",
      status: "active",
      periodStart: new Date("2026-06-01T00:00:00.000Z"),
      periodEnd: new Date("2026-07-01T00:00:00.000Z"),
      stripeCustomerId: "cus_test",
      stripeSubscriptionId: "sub_test",
    })
  }

  if (input?.seedSandbox) {
    const seeded = input.seedSandbox
    sandbox.sandboxes.set(
      seeded.organizationId,
      createSandbox({ organizationId: seeded.organizationId, createdByUserId: ADMIN_USER_ID, status: seeded.status }),
    )
    sandbox.parentByOrganizationId.set(seeded.organizationId, PARENT_ORG_ID)
    organization.organizations.set(
      seeded.organizationId,
      createOrganization({
        id: seeded.organizationId,
        name: "Seeded",
        slug: `seeded-${seeded.organizationId}`,
        parentOrgId: PARENT_ORG_ID,
      }),
    )
  }

  const layer = Layer.mergeAll(
    Layer.succeed(SandboxRepository, sandbox.repository),
    Layer.succeed(OrganizationRepository, organization.repository),
    Layer.succeed(MembershipRepository, membership.repository),
    Layer.succeed(BillingOverrideRepository, override.repository),
    Layer.succeed(StripeSubscriptionLookup, subscription.service),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: PARENT_ORG_ID })),
    Layer.succeed(SettingsReader, {
      getOrganizationSettings: () => Effect.succeed(null),
      getProjectSettings: () => Effect.die("sandbox use-cases do not read project settings"),
    }),
  )

  return { layer, sandbox }
}

describe("sandbox lifecycle (unit)", () => {
  it("creates an active sandbox under the parent org", async () => {
    const { layer, sandbox } = buildLayer()

    const result = await Effect.runPromise(
      createSandboxUseCase({ parentOrganizationId: PARENT_ORG_ID, actorUserId: ADMIN_USER_ID, name: "Debug" }).pipe(
        Effect.provide(layer),
      ),
    )

    expect(result.organization.parentOrgId).toBe(PARENT_ORG_ID)
    expect(result.sandbox.status).toBe("active")
    expect(sandbox.sandboxes.get(result.organization.id)?.createdByUserId).toBe(ADMIN_USER_ID)
  })

  it("refuses a non-member of the parent org", async () => {
    const { layer } = buildLayer({ isMember: false })

    const exit = await Effect.runPromiseExit(
      createSandboxUseCase({ parentOrganizationId: PARENT_ORG_ID, actorUserId: ADMIN_USER_ID, name: "Nope" }).pipe(
        Effect.provide(layer),
      ),
    )

    expect(failure(exit)).toBeInstanceOf(SandboxAccessDeniedError)
  })

  it("refuses creation once the Free active cap of 1 is reached", async () => {
    const existing = OrganizationId(generateId())
    const { layer } = buildLayer({ seedSandbox: { organizationId: existing, status: "active" } })

    const exit = await Effect.runPromiseExit(
      createSandboxUseCase({ parentOrganizationId: PARENT_ORG_ID, actorUserId: ADMIN_USER_ID, name: "Second" }).pipe(
        Effect.provide(layer),
      ),
    )

    expect(failure(exit)).toBeInstanceOf(SandboxActiveCapReachedError)
  })

  it("archiving frees a slot, then reactivation fits within the cap", async () => {
    const existing = OrganizationId(generateId())
    const { layer } = buildLayer({ seedSandbox: { organizationId: existing, status: "active" } })

    await Effect.runPromise(
      archiveSandboxUseCase({ sandboxOrganizationId: existing, actorUserId: ADMIN_USER_ID }).pipe(
        Effect.provide(layer),
      ),
    )

    const reactivated = await Effect.runPromise(
      reactivateSandboxUseCase({ sandboxOrganizationId: existing, actorUserId: ADMIN_USER_ID }).pipe(
        Effect.provide(layer),
      ),
    )
    expect(reactivated.status).toBe("active")
  })
})
