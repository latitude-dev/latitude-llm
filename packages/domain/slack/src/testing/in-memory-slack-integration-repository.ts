import { Effect, Layer } from "effect"
import type { SlackIntegration } from "../entities/slack-integration.ts"
import { SlackIntegrationConflictError } from "../errors.ts"
import { SlackIntegrationRepository } from "../ports/slack-integration-repository.ts"

/**
 * In-memory test double for {@link SlackIntegrationRepository}. Mirrors
 * the live adapter's invariants: a single active row per `teamId`
 * (`revoked_at IS NULL`) across all orgs (cross-org conflict), and a
 * single active row per organization. `seed` lets tests inject rows
 * representing prior state.
 *
 * State lives outside `Effect.sync` so a single layer instance shares
 * its rows across multiple `Effect.provide` boundaries inside the same
 * test. Construct a fresh layer for each independent scenario.
 *
 * Note: tests using this layer simulate the RLS scope by sharing one
 * `organizationId` across all calls; the repository keys all reads on
 * that value, so multi-org assertions must construct multiple layers.
 */
export const InMemorySlackIntegrationRepositoryLive = (init: {
  readonly organizationId: string
  readonly seed?: readonly SlackIntegration[]
}) => {
  const rows = new Map<string, SlackIntegration>()
  for (const row of init.seed ?? []) rows.set(row.id, row)

  const activeRowsInOrg = (): SlackIntegration[] =>
    [...rows.values()].filter((r) => r.organizationId === init.organizationId && r.revokedAt === null)

  const activeRowForTeamId = (teamId: string): SlackIntegration | undefined =>
    [...rows.values()].find((r) => r.teamId === teamId && r.revokedAt === null)

  return Layer.succeed(SlackIntegrationRepository, {
    findActiveByOrganizationId: () =>
      Effect.sync(() => {
        const active = activeRowsInOrg()
        return active[0] ?? null
      }),

    save: (integration) =>
      Effect.gen(function* () {
        const conflict = activeRowForTeamId(integration.teamId)
        if (conflict && conflict.organizationId !== init.organizationId) {
          return yield* Effect.fail(new SlackIntegrationConflictError({ teamId: integration.teamId }))
        }
        const stored: SlackIntegration = {
          ...integration,
          organizationId: init.organizationId as SlackIntegration["organizationId"],
        }
        rows.set(stored.id, stored)
        return stored
      }),

    softRevokeById: (id, revokedAt) =>
      Effect.sync(() => {
        const row = rows.get(id)
        if (!row || row.organizationId !== init.organizationId || row.revokedAt !== null) return false
        rows.set(id, { ...row, revokedAt, updatedAt: new Date() })
        return true
      }),
  })
}
