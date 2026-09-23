import { type AdminFeatureFlagEligibility, AdminFeatureFlagRepository, getProjectDetailsUseCase } from "@domain/admin"
import { AgentScoreDigestSource, agentScoreDigestWindow } from "@domain/agent-score"
import { generateId, OrganizationId, ProjectId, ValidationError } from "@domain/shared"
import {
  AdminFeatureFlagRepositoryLive,
  AdminProjectRepositoryLive,
  AgentScoreDigestSourceLive,
  withPostgres,
} from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
import { adminMiddleware } from "../../server/admin-middleware.ts"
import { getAdminPostgresClient, getQueuePublisher } from "../../server/clients.ts"
import { adminAgentScoreProjectInputSchema } from "./agent-score.functions.ts"

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

/**
 * Send this project's weekly Agent Score digest now, rather than waiting for Monday's cron.
 *
 * A weekly schedule is otherwise only observable once a week, so this is how the pipeline gets
 * exercised. It publishes the same producer task the fan-out does, over the same window the cron
 * would resolve today, so what staff see is what recipients would have received.
 *
 * Eligibility is the fan-out's, re-checked here because the fan-out is where it normally lives: a
 * manual send must not reach an organization whose members cannot open what it links to, or a
 * project whose numbers are seeded.
 *
 * Every click is its own send. The weekly job keys its notifications by project and week, so a retry
 * dedupes into the digest already delivered; a manual send carrying that same key would do nothing
 * after the week's first, and say "enqueued" while doing it. A fresh request id per click joins the
 * key instead. That means each click notifies every member again, which the modal warns about, the
 * same way the Wrapped button does.
 *
 * The organization comes from the project lookup rather than the caller, so a request cannot name a
 * tenant it has nothing to do with. No BullMQ dedupeKey: a failed jobId stays burned until removed,
 * which would block the retry this button exists to allow.
 */
export const adminSendAgentScoreDigest = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator(adminAgentScoreProjectInputSchema)
  .handler(async ({ data }): Promise<{ enqueued: true; windowStart: string; windowEnd: string }> => {
    const { from, to } = agentScoreDigestWindow(new Date())

    const project = await Effect.runPromise(
      Effect.gen(function* () {
        const project = yield* getProjectDetailsUseCase({ projectId: ProjectId(data.projectId) })
        yield* ensureManualDigestEligible({
          organization: project.organization,
          project,
          window: { from, to },
        })
        return project
      }).pipe(
        withPostgres(
          Layer.mergeAll(AdminProjectRepositoryLive, AdminFeatureFlagRepositoryLive, AgentScoreDigestSourceLive),
          getAdminPostgresClient(),
        ),
        withTracing,
      ),
    )

    const publisher = await getQueuePublisher()
    await Effect.runPromise(
      publisher
        .publish("notifications", "request-agent-score-digest-notifications", {
          organizationId: project.organization.id,
          projectId: project.id,
          windowStart: from,
          windowEnd: to,
          manualRequestId: generateId(),
        })
        .pipe(withTracing),
    )

    return { enqueued: true, windowStart: from, windowEnd: to }
  })
