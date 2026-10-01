import { type AdminFeatureFlagEligibility, AdminFeatureFlagRepository } from "@domain/admin"
import { AgentScoreDigestSource } from "@domain/agent-score"
import { OrganizationId, ValidationError } from "@domain/shared"
import { Effect } from "effect"

/**
 * Whether an organization may be sent a digest. A flag enabled for all covers every organization
 * without the eligibility read enumerating them, so the list is only consulted when it is not.
 *
 * Exported for tests.
 */
export const isDigestEligible = (eligibility: AdminFeatureFlagEligibility, organizationId: string): boolean =>
  eligibility.enabledForAll || eligibility.organizationIds.includes(OrganizationId(organizationId))

/**
 * Fails unless the weekly job itself would send this project a digest over `window`.
 *
 * Both gates are the fan-out's own: the organization's flag, and `AgentScoreDigestSource` for the
 * project. Reusing the source rather than re-listing its exclusions here keeps a manual send from
 * reaching a project the job would skip — sample and showcase projects, whose seeded history is
 * published under the live scoring version and reads as real, soft-deleted projects, sandbox orgs,
 * and projects with no score in the window.
 *
 * Exported for tests.
 */
export const ensureManualDigestEligible = (input: {
  readonly organization: { readonly id: string; readonly name: string }
  readonly project: { readonly id: string; readonly name: string }
  readonly window: { readonly from: string; readonly to: string }
}) =>
  Effect.gen(function* () {
    const flags = yield* AdminFeatureFlagRepository
    const eligibility = yield* flags.findEligibilityForFlag("agentScore")
    if (!isDigestEligible(eligibility, input.organization.id)) {
      return yield* Effect.fail(
        new ValidationError({
          field: "projectId",
          message: `${input.organization.name} does not have the Agent Score feature flag enabled, so its members cannot open what the digest links to. Enable it first.`,
        }),
      )
    }

    const source = yield* AgentScoreDigestSource
    const candidates = yield* source.listProjectsWithPublishedScores({
      from: input.window.from,
      to: input.window.to,
      organizationIds: [OrganizationId(input.organization.id)],
    })
    if (!candidates.some((candidate) => candidate.projectId === input.project.id)) {
      return yield* Effect.fail(
        new ValidationError({
          field: "projectId",
          message: `${input.project.name} would not get a digest this week. It only goes to projects that published an Agent Score between ${input.window.from} and ${input.window.to}, and never to sample or showcase projects, whose score history is seeded.`,
        }),
      )
    }
  })
