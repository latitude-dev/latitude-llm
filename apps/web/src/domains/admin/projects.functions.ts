import {
  type AdminProjectDetails,
  getProjectDetailsUseCase,
  getProjectMetricsUseCase,
  type ProjectMetrics,
} from "@domain/admin"
import { ProjectId } from "@domain/shared"
import { AdminProjectMetricsRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { AdminProjectRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { z } from "zod"
import { adminMiddleware } from "../../server/admin-middleware.ts"
import { getAdminPostgresClient, getClickhouseClient } from "../../server/clients.ts"

interface AdminProjectOrganizationDto {
  id: string
  name: string
  slug: string
}

interface AdminProjectDetailsDto {
  id: string
  name: string
  slug: string
  organization: AdminProjectOrganizationDto
  settings: { keepMonitoring?: boolean | undefined } | null
  firstTraceAt: string | null
  lastEditedAt: string
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

const toDto = (details: AdminProjectDetails): AdminProjectDetailsDto => ({
  id: details.id,
  name: details.name,
  slug: details.slug,
  organization: details.organization,
  settings: details.settings,
  firstTraceAt: details.firstTraceAt ? details.firstTraceAt.toISOString() : null,
  lastEditedAt: details.lastEditedAt.toISOString(),
  deletedAt: details.deletedAt ? details.deletedAt.toISOString() : null,
  createdAt: details.createdAt.toISOString(),
  updatedAt: details.updatedAt.toISOString(),
})

/**
 * Exported for input-schema tests.
 */
export const adminGetProjectInputSchema = z.object({
  projectId: z.string().min(1).max(256),
})

/**
 * Backoffice project-detail fetch.
 *
 * Guard: {@link adminMiddleware} — runs before validation, rejects
 * non-admins with `NotFoundError` (identical to hitting a non-existent
 * server function). Queries use {@link getAdminPostgresClient} +
 * `withPostgres` at the default `OrganizationId("system")` scope —
 * the only sanctioned RLS-bypass signal.
 */
export const adminGetProject = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .inputValidator(adminGetProjectInputSchema)
  .handler(async ({ data }): Promise<AdminProjectDetailsDto> => {
    const client = getAdminPostgresClient()

    const details = await Effect.runPromise(
      getProjectDetailsUseCase({ projectId: ProjectId(data.projectId) }).pipe(
        withPostgres(AdminProjectRepositoryLive, client),
        withTracing,
      ),
    )

    return toDto(details)
  })

// ───────────────────────────────────────────────────────────────────
// Project metrics over time (backoffice panel)
// ───────────────────────────────────────────────────────────────────

interface ProjectMetricsActivityPointDto {
  bucketStart: string
  traceCount: number
  annotationsPassed: number
  annotationsFailed: number
}

interface ProjectIssueLifecyclePointDto {
  bucketStart: string
  untracked: number
  tracked: number
  resolved: number
}

interface ProjectTopIssueDto {
  id: string
  name: string
  occurrences: number
  lastSeenAt: string
  state: "untracked" | "tracked" | "resolved"
}

export interface AdminProjectMetricsDto {
  windowEnd: string
  windowDays: number
  activity: ProjectMetricsActivityPointDto[]
  issuesLifecycle: ProjectIssueLifecyclePointDto[]
  topIssues: ProjectTopIssueDto[]
}

const toMetricsDto = (metrics: ProjectMetrics): AdminProjectMetricsDto => ({
  windowEnd: metrics.windowEnd.toISOString(),
  windowDays: metrics.windowDays,
  activity: metrics.activity.map((p) => ({
    bucketStart: p.bucketStart,
    traceCount: p.traceCount,
    annotationsPassed: p.annotationsPassed,
    annotationsFailed: p.annotationsFailed,
  })),
  issuesLifecycle: metrics.issuesLifecycle.map((p) => ({
    bucketStart: p.bucketStart,
    untracked: p.untracked,
    tracked: p.tracked,
    resolved: p.resolved,
  })),
  topIssues: metrics.topIssues.map((i) => ({
    id: i.id,
    name: i.name,
    occurrences: i.occurrences,
    lastSeenAt: i.lastSeenAt.toISOString(),
    state: i.state,
  })),
})

export const adminGetProjectMetricsInputSchema = z.object({
  projectId: z.string().min(1).max(256),
  windowDays: z.number().int().positive().max(90).optional(),
})

/**
 * Backoffice "project metrics over time" panel data fetch.
 *
 * Guard: {@link adminMiddleware}. PG queries run on the admin client at
 * the `"system"` org scope (RLS bypass); CH aggregates `traces` /
 * `scores` cross-tenant via the dedicated admin port — see security
 * warnings on `AdminProjectMetricsRepositoryLive` and
 * `AdminProjectRepositoryLive`.
 */
export const adminGetProjectMetrics = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .inputValidator(adminGetProjectMetricsInputSchema)
  .handler(async ({ data }): Promise<AdminProjectMetricsDto> => {
    const metrics = await Effect.runPromise(
      getProjectMetricsUseCase({
        projectId: ProjectId(data.projectId),
        ...(data.windowDays !== undefined ? { windowDays: data.windowDays } : {}),
      }).pipe(
        withPostgres(AdminProjectRepositoryLive, getAdminPostgresClient()),
        withClickHouse(AdminProjectMetricsRepositoryLive, getClickhouseClient()),
        withTracing,
      ),
    )

    return toMetricsDto(metrics)
  })
