import {
  createSavedSearch,
  deleteSavedSearch,
  getSavedSearchBySlug,
  listSavedSearches,
  SAVED_SEARCH_NAME_MAX_LENGTH,
  SAVED_SEARCH_QUERY_MAX_LENGTH,
  type SavedSearch,
  searchSavedSearches,
  updateSavedSearch,
} from "@domain/saved-searches"
import { filterSetSchema, OrganizationId, ProjectId, SavedSearchId, UserId } from "@domain/shared"
import { OutboxEventWriterLive, SavedSearchRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
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

export interface SavedSearchSearchRecord {
  readonly id: string
  readonly projectId: string
  readonly projectSlug: string
  readonly projectName: string
  readonly slug: string
  readonly name: string
}

/**
 * Org-wide saved-search search for the Command Palette. Unlike {@link listSavedSearchesByProject},
 * this returns matching saved searches across every project in the caller's organization, each
 * tagged with its owning project's slug/name.
 */
export const searchSavedSearchesOrgWide = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      searchQuery: z.string().max(500).optional(),
      preferProjectId: z.string().optional(),
      limit: z.number().int().min(1).max(25).optional(),
    }),
  )
  .handler(async ({ data }): Promise<readonly SavedSearchSearchRecord[]> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)

    const results = await Effect.runPromise(
      searchSavedSearches({
        ...(data.searchQuery !== undefined ? { searchQuery: data.searchQuery } : {}),
        ...(data.preferProjectId !== undefined ? { preferProjectId: ProjectId(data.preferProjectId) } : {}),
        ...(data.limit !== undefined ? { limit: data.limit } : {}),
      }).pipe(withPostgres(SavedSearchRepositoryLive, getPostgresClient(), orgId), withTracing),
    )

    return results.map(
      (r): SavedSearchSearchRecord => ({
        id: r.id,
        projectId: r.projectId,
        projectSlug: r.projectSlug,
        projectName: r.projectName,
        slug: r.slug,
        name: r.name,
      }),
    )
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
      }).pipe(
        withPostgres(Layer.mergeAll(SavedSearchRepositoryLive, OutboxEventWriterLive), getPostgresClient(), orgId),
        withTracing,
      ),
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
        withPostgres(Layer.mergeAll(SavedSearchRepositoryLive, OutboxEventWriterLive), getPostgresClient(), orgId),
        withTracing,
      ),
    )
  })
