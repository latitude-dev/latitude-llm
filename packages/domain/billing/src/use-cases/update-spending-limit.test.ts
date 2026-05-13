import { BillingOverrideRepository, StripeSubscriptionLookup, updateSpendingLimitUseCase } from "@domain/billing"
import { createFakeBillingOverrideRepository, createFakeStripeSubscriptionLookup } from "@domain/billing/testing"
import { createOrganization, MembershipRepository, OrganizationRepository } from "@domain/organizations"
import { createFakeMembershipRepository, createFakeOrganizationRepository } from "@domain/organizations/testing"
import {
  BadRequestError,
  OrganizationId,
  type OrganizationSettings,
  PermissionError,
  SettingsReader,
  SqlClient,
  UserId,
} from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer, Result } from "effect"
import { describe, expect, it } from "vitest"

const ORGANIZATION_ID = OrganizationId("o".repeat(24))
const USER_ID = UserId("u".repeat(24))

const createLayer = (input?: {
  readonly isAdmin?: boolean
  readonly organizationSettings?: OrganizationSettings | null
  readonly subscriptionPlan?: string | null
}) => {
  const { repository: membershipRepository } = createFakeMembershipRepository({
    isAdmin: () => Effect.succeed(input?.isAdmin ?? true),
  })
  const { repository: organizationRepository, organizations } = createFakeOrganizationRepository()
  const { repository: billingOverrideRepository } = createFakeBillingOverrideRepository()
  const { service: stripeSubscriptionLookup, subscriptionsByOrganizationId } = createFakeStripeSubscriptionLookup()

  organizations.set(
    ORGANIZATION_ID,
    createOrganization({
      id: ORGANIZATION_ID,
      name: "Acme",
      slug: "acme",
      settings: input?.organizationSettings ?? {},
    }),
  )

  if (input?.subscriptionPlan) {
    subscriptionsByOrganizationId.set(String(ORGANIZATION_ID), {
      plan: input.subscriptionPlan,
      status: "active",
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      periodEnd: new Date("2026-02-01T00:00:00.000Z"),
      stripeCustomerId: "cus_123",
      stripeSubscriptionId: "sub_123",
    })
  }

  return {
    organizations,
    layer: Layer.mergeAll(
      Layer.succeed(MembershipRepository, membershipRepository),
      Layer.succeed(OrganizationRepository, organizationRepository),
      Layer.succeed(BillingOverrideRepository, billingOverrideRepository),
      Layer.succeed(StripeSubscriptionLookup, stripeSubscriptionLookup),
      Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: ORGANIZATION_ID })),
      Layer.succeed(SettingsReader, {
        getOrganizationSettings: () => Effect.succeed(input?.organizationSettings ?? {}),
        getProjectSettings: () => Effect.die("updateSpendingLimitUseCase does not read project settings"),
      }),
    ),
  }
}

describe("updateSpendingLimitUseCase", () => {
  it("rejects callers who are not org admins", async () => {
    const { layer } = createLayer({ isAdmin: false, subscriptionPlan: "pro" })

    const result = await Effect.runPromise(
      Effect.result(
        updateSpendingLimitUseCase({
          organizationId: ORGANIZATION_ID,
          userId: USER_ID,
          spendingLimitDollars: 120,
        }).pipe(Effect.provide(layer)),
      ),
    )

    expect(Result.isFailure(result)).toBe(true)
    if (Result.isFailure(result)) {
      expect(result.failure).toBeInstanceOf(PermissionError)
    }
  })

  it("rejects spending limits for organizations that are not on the pro plan", async () => {
    const { layer } = createLayer()

    const result = await Effect.runPromise(
      Effect.result(
        updateSpendingLimitUseCase({
          organizationId: ORGANIZATION_ID,
          userId: USER_ID,
          spendingLimitDollars: 120,
        }).pipe(Effect.provide(layer)),
      ),
    )

    expect(Result.isFailure(result)).toBe(true)
    if (Result.isFailure(result)) {
      expect(result.failure).toBeInstanceOf(BadRequestError)
    }
  })

  it("rejects limits below the pro base subscription price", async () => {
    const { layer } = createLayer({ subscriptionPlan: "pro" })

    const result = await Effect.runPromise(
      Effect.result(
        updateSpendingLimitUseCase({
          organizationId: ORGANIZATION_ID,
          userId: USER_ID,
          spendingLimitDollars: 98,
        }).pipe(Effect.provide(layer)),
      ),
    )

    expect(Result.isFailure(result)).toBe(true)
    if (Result.isFailure(result)) {
      expect(result.failure).toBeInstanceOf(BadRequestError)
      expect(result.failure.httpMessage).toContain("at least $99.00")
    }
  })

  it("updates the organization billing settings when the new limit is valid", async () => {
    const { layer, organizations } = createLayer({
      subscriptionPlan: "pro",
      organizationSettings: { billing: { spendingLimitCents: 12_300 } },
    })

    await Effect.runPromise(
      updateSpendingLimitUseCase({
        organizationId: ORGANIZATION_ID,
        userId: USER_ID,
        spendingLimitDollars: 150,
      }).pipe(Effect.provide(layer)),
    )

    expect(organizations.get(ORGANIZATION_ID)?.settings).toEqual({
      billing: { spendingLimitCents: 15_000 },
    })
  })

  it("clears the spending limit while preserving unrelated organization settings", async () => {
    const { layer, organizations } = createLayer({
      subscriptionPlan: "pro",
      organizationSettings: {
        keepMonitoring: false,
        billing: {
          spendingLimitCents: 12_300,
        },
      },
    })

    await Effect.runPromise(
      updateSpendingLimitUseCase({
        organizationId: ORGANIZATION_ID,
        userId: USER_ID,
        spendingLimitDollars: null,
      }).pipe(Effect.provide(layer)),
    )

    expect(organizations.get(ORGANIZATION_ID)?.settings).toEqual({
      keepMonitoring: false,
    })
  })
})
