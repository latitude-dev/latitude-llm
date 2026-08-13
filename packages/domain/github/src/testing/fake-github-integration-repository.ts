import { OrganizationId } from "@domain/shared"
import { Effect } from "effect"
import type { GithubIntegration } from "../entities/github-integration.ts"
import { GithubIntegrationConflictError } from "../errors.ts"
import type { GithubIntegrationRepositoryShape } from "../ports/repositories.ts"

/**
 * In-memory {@link GithubIntegrationRepository}. Mirrors the live adapter's
 * invariants: at most one active row per installation across all orgs
 * (cross-org conflict), at most one active row per org. `seed` may carry rows
 * from other orgs to exercise the conflict path.
 */
export const createFakeGithubIntegrationRepository = (init: {
  readonly organizationId: string
  readonly seed?: readonly GithubIntegration[]
}) => {
  const rows = new Map<string, GithubIntegration>()
  for (const row of init.seed ?? []) rows.set(row.id, row)

  const orgId = OrganizationId(init.organizationId)
  const activeInOrg = (): GithubIntegration[] =>
    [...rows.values()].filter((r) => r.organizationId === orgId && r.revokedAt === null)
  const activeForInstallation = (installationId: number): GithubIntegration | undefined =>
    [...rows.values()].find((r) => r.installationId === installationId && r.revokedAt === null)

  const repository: GithubIntegrationRepositoryShape = {
    findActiveByOrganizationId: () => Effect.sync(() => activeInOrg()[0] ?? null),

    save: (integration) =>
      Effect.gen(function* () {
        const conflict = activeForInstallation(integration.installationId)
        if (conflict && conflict.organizationId !== orgId) {
          return yield* new GithubIntegrationConflictError({ installationId: integration.installationId })
        }
        if (activeInOrg().length > 0) {
          return yield* Effect.die(
            new Error("fake github repo invariant: a second active row was saved without soft-revoking the first"),
          )
        }
        const stored: GithubIntegration = { ...integration, organizationId: orgId }
        rows.set(stored.id, stored)
        return stored
      }),

    softRevokeById: (id, revokedAt) =>
      Effect.sync(() => {
        const row = rows.get(id)
        if (!row || row.organizationId !== orgId || row.revokedAt !== null) return false
        rows.set(id, { ...row, revokedAt, updatedAt: new Date() })
        return true
      }),

    setSuspendedById: (id, suspendedAt) =>
      Effect.sync(() => {
        const row = rows.get(id)
        if (!row || row.organizationId !== orgId) return false
        rows.set(row.id, { ...row, suspendedAt, updatedAt: new Date() })
        return true
      }),

    updateMetadataById: ({ id, accountLogin, accountType, repositorySelection }) =>
      Effect.sync(() => {
        const row = rows.get(id)
        if (!row || row.organizationId !== orgId) return false
        rows.set(row.id, { ...row, accountLogin, accountType, repositorySelection, updatedAt: new Date() })
        return true
      }),
  }

  return { repository, rows }
}
