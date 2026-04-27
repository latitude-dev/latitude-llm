import { NotFoundError, type OrganizationId } from "@domain/shared"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { getOrganizationDetailsUseCase } from "./get-organization-details.ts"
import type { AdminOrganizationDetails } from "./organization-details.ts"
import { AdminOrganizationRepository } from "./organization-repository.ts"

const TARGET = "org-target" as OrganizationId

const successfulRepo = (result: AdminOrganizationDetails) =>
  Layer.succeed(AdminOrganizationRepository, {
    findById: () => Effect.succeed(result),
  })

const missingRepo = () =>
  Layer.succeed(AdminOrganizationRepository, {
    findById: (id) => Effect.fail(new NotFoundError({ entity: "Organization", id })),
  })

const mkDetails = (overrides: Partial<AdminOrganizationDetails> = {}): AdminOrganizationDetails => ({
  id: TARGET,
  name: "Acme",
  slug: "acme",
  stripeCustomerId: null,
  members: [],
  projects: [],
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
  ...overrides,
})

describe("getOrganizationDetailsUseCase", () => {
  it("returns the organisation details from the repository", async () => {
    const details = mkDetails()
    const result = await Effect.runPromise(
      getOrganizationDetailsUseCase({ organizationId: TARGET }).pipe(Effect.provide(successfulRepo(details))),
    )
    expect(result).toBe(details)
  })

  it("propagates NotFoundError verbatim when the organisation does not exist", async () => {
    await expect(
      Effect.runPromise(
        getOrganizationDetailsUseCase({ organizationId: TARGET }).pipe(Effect.provide(missingRepo())),
      ),
    ).rejects.toMatchObject({ _tag: "NotFoundError", entity: "Organization" })
  })
})
