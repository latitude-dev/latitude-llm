import { StripeSubscriptionLookup } from "@domain/billing"
import { generateId, OrganizationId } from "@domain/shared"
import { organizations, subscriptions } from "@platform/db-postgres/schema/better-auth"
import { withTracing } from "@repo/observability"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { setupTestPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { StripeSubscriptionLookupLive } from "./stripe-subscription-lookup.ts"

const pg = setupTestPostgres()

describe("StripeSubscriptionLookupLive", () => {
  it("returns a stale mirrored period unchanged when Stripe is not configured", async () => {
    const organizationId = generateId()
    const periodStart = new Date("2026-06-29T08:40:14.000Z")
    const periodEnd = new Date("2026-07-29T08:40:14.000Z")

    await pg.db.insert(organizations).values({
      id: organizationId,
      name: "Stale Period Org",
      slug: `stale-period-${organizationId}`,
    })
    await pg.db.insert(subscriptions).values({
      id: generateId(),
      plan: "pro",
      referenceId: organizationId,
      stripeCustomerId: "cus_stale",
      stripeSubscriptionId: "sub_stale",
      status: "active",
      periodStart,
      periodEnd,
    })

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const lookup = yield* StripeSubscriptionLookup
        return yield* lookup.findOptionalActiveByOrganizationId(OrganizationId(organizationId))
      }).pipe(
        withPostgres(StripeSubscriptionLookupLive, pg.appPostgresClient, OrganizationId(organizationId)),
        withTracing,
      ),
    )

    expect(result).toMatchObject({
      plan: "pro",
      status: "active",
      stripeSubscriptionId: "sub_stale",
      periodStart,
      periodEnd,
    })
  })
})
