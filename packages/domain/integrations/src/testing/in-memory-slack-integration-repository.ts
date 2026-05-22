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
        const crossOrgConflict = activeRowForTeamId(integration.teamId)
        if (crossOrgConflict && crossOrgConflict.organizationId !== init.organizationId) {
          return yield* new SlackIntegrationConflictError({ teamId: integration.teamId })
        }

        // Mirror the DB's `integrations_active_organization_kind_idx`
        // partial unique invariant: at most one active row per org.
        // Callers must soft-revoke the existing active row before
        // re-saving (which `installSlackIntegrationUseCase` does). A
        // second active row in the same org indicates a use-case bug,
        // so panic via `Effect.die` to surface it loudly — the DB
        // would reject the insert with a unique violation in
        // production.
        const sameOrgActive = activeRowsInOrg()
        const [firstActive] = sameOrgActive
        if (firstActive) {
          return yield* Effect.die(
            new Error(
              `InMemorySlackIntegrationRepository invariant violated: tried to save a second active row in org ${init.organizationId} without soft-revoking ${firstActive.id} first`,
            ),
          )
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

    updateRoutes: (integrationId, group, routes) =>
      Effect.sync(() => {
        const row = rows.get(integrationId)
        if (!row || row.organizationId !== init.organizationId || row.revokedAt !== null) return false
        const nextRoutes = { ...row.routes, [group]: [...routes] }
        rows.set(integrationId, { ...row, routes: nextRoutes, updatedAt: new Date() })
        return true
      }),
  })
}
