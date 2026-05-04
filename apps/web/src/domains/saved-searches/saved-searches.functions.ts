import {
  createSavedSearch,
  deleteSavedSearch,
  getSavedSearchBySlug,
  listSavedSearches,
  SAVED_SEARCH_NAME_MAX_LENGTH,
  SAVED_SEARCH_QUERY_MAX_LENGTH,
  type SavedSearch,
  updateSavedSearch,
} from "@domain/saved-searches"
import { filterSetSchema, OrganizationId, ProjectId, SavedSearchId, UserId } from "@domain/shared"
import { SavedSearchRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getPostgresClient } from "../../server/clients.ts"

export interface SavedSearchRecord {
  readonly id: string
  readonly organizationId: string
  readonly projectId: string
  readonly slug: string
  readonly name: string
  readonly query: string | null
  readonly filterSet: SavedSearch["filterSet"]
  readonly assignedUserId: string | null
  readonly createdByUserId: string
  readonly createdAt: string
  readonly updatedAt: string
}

const toRecord = (s: SavedSearch): SavedSearchRecord => ({
  id: s.id,
  organizationId: s.organizationId,
  projectId: s.projectId,
  slug: s.slug,
  name: s.name,
  query: s.query,
  filterSet: s.filterSet,
  assignedUserId: s.assignedUserId,
  createdByUserId: s.createdByUserId,
  createdAt: s.createdAt.toISOString(),
  updatedAt: s.updatedAt.toISOString(),
})

const nameSchema = z.string().min(1).max(SAVED_SEARCH_NAME_MAX_LENGTH)
const querySchema = z.string().max(SAVED_SEARCH_QUERY_MAX_LENGTH).nullable()

export const listSavedSearchesByProject = createServerFn({ method: "GET" })
  .inputValidator(z.object({ projectId: z.string() }))
  .handler(async ({ data }): Promise<readonly SavedSearchRecord[]> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)

    const page = await Effect.runPromise(
      listSavedSearches({ projectId: ProjectId(data.projectId) }).pipe(
        withPostgres(SavedSearchRepositoryLive, getPostgresClient(), orgId),
        withTracing,
      ),
    )
    return page.items.map(toRecord)
  })

export const getSavedSearchBySlugFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ projectId: z.string(), slug: z.string() }))
  .handler(async ({ data }): Promise<SavedSearchRecord | null> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)

    return Effect.runPromise(
      getSavedSearchBySlug({ projectId: ProjectId(data.projectId), slug: data.slug })
        .pipe(Effect.map(toRecord))
        .pipe(
          Effect.catchTag("SavedSearchNotFoundError", () => Effect.succeed(null)),
          withPostgres(SavedSearchRepositoryLive, getPostgresClient(), orgId),
          withTracing,
        ),
    )
  })

export const createSavedSearchFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      name: nameSchema,
      query: querySchema,
      filterSet: filterSetSchema,
    }),
  )
  .handler(async ({ data }): Promise<SavedSearchRecord> => {
    const { organizationId, userId } = await requireSession()
    const orgId = OrganizationId(organizationId)

    const created = await Effect.runPromise(
      createSavedSearch({
        projectId: ProjectId(data.projectId),
        name: data.name,
        query: data.query,
        filterSet: data.filterSet,
        createdByUserId: UserId(userId),
      }).pipe(withPostgres(SavedSearchRepositoryLive, getPostgresClient(), orgId), withTracing),
    )
    return toRecord(created)
  })

export const updateSavedSearchFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      id: z.string(),
      name: nameSchema.optional(),
      query: querySchema.optional(),
      filterSet: filterSetSchema.optional(),
      assignedUserId: z.string().nullable().optional(),
    }),
  )
  .handler(async ({ data }): Promise<SavedSearchRecord> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)

    const updated = await Effect.runPromise(
      updateSavedSearch({
        id: SavedSearchId(data.id),
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.query !== undefined ? { query: data.query } : {}),
        ...(data.filterSet !== undefined ? { filterSet: data.filterSet } : {}),
        ...(data.assignedUserId !== undefined
          ? { assignedUserId: data.assignedUserId === null ? null : UserId(data.assignedUserId) }
          : {}),
      }).pipe(withPostgres(SavedSearchRepositoryLive, getPostgresClient(), orgId), withTracing),
    )
    return toRecord(updated)
  })

export const deleteSavedSearchFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }): Promise<void> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)

    await Effect.runPromise(
      deleteSavedSearch({ savedSearchId: SavedSearchId(data.id) }).pipe(
        withPostgres(SavedSearchRepositoryLive, getPostgresClient(), orgId),
        withTracing,
      ),
    )
  })
