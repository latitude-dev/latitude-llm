import { OrganizationId } from "@domain/shared"
import { Effect } from "effect"
import type { GithubSyncConfigRow } from "../entities/github-sync-config.ts"
import type { GithubSyncConfigRepositoryShape } from "../ports/repositories.ts"

export const createFakeGithubSyncConfigRepository = (init: {
  readonly organizationId: string
  readonly seed?: readonly GithubSyncConfigRow[]
}) => {
  const rows = new Map<string, GithubSyncConfigRow>()
  for (const row of init.seed ?? []) rows.set(row.id, row)

  const orgId = OrganizationId(init.organizationId)
  const inOrg = (): GithubSyncConfigRow[] => [...rows.values()].filter((r) => r.organizationId === orgId)

  const repository: GithubSyncConfigRepositoryShape = {
    create: (row) =>
      Effect.sync(() => {
        const stored: GithubSyncConfigRow = { ...row, organizationId: orgId }
        rows.set(stored.id, stored)
        return stored
      }),

    upsert: (row) =>
      Effect.sync(() => {
        const stored: GithubSyncConfigRow = { ...row, organizationId: orgId }
        rows.set(stored.id, stored)
        return stored
      }),

    findById: (id) => Effect.sync(() => inOrg().find((r) => r.id === id) ?? null),

    findDefaultByIntegration: (integrationId) =>
      Effect.sync(() => inOrg().find((r) => r.projectId === null && r.integrationId === integrationId) ?? null),

    findByProject: (integrationId, projectId) =>
      Effect.sync(() => inOrg().find((r) => r.integrationId === integrationId && r.projectId === projectId) ?? null),

    listByOrganizationRepo: (integrationId, repoId) =>
      Effect.sync(() =>
        inOrg().filter(
          (r) => r.projectId !== null && r.integrationId === integrationId && r.repoId === repoId && r.enabled,
        ),
      ),

    listProjectConfigs: (integrationId) =>
      Effect.sync(() => inOrg().filter((r) => r.projectId !== null && r.integrationId === integrationId)),

    deleteByProject: (projectId) =>
      Effect.sync(() => {
        for (const [id, row] of rows) {
          if (row.organizationId === orgId && row.projectId === projectId) rows.delete(id)
        }
      }),
  }

  return { repository, rows }
}
