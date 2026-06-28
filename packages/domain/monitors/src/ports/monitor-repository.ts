import type {
  AlertSeverity,
  FilterSet,
  MonitorId,
  MonitorTargetType,
  MonitorTrigger,
  NotFoundError,
  OrganizationId,
  ProjectId,
  RepositoryError,
  SqlClient,
} from "@domain/shared"
import { Context, type Effect } from "effect"
import type { Monitor } from "../entities/monitor.ts"

export interface ProjectWithActiveMonitors {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
}

export interface ListMonitorsRepositoryInput {
  readonly projectId: ProjectId
  readonly limit: number
  readonly offset: number
  readonly searchQuery?: string
  readonly system?: boolean
}

export interface MonitorLastIncident {
  readonly id: string
  readonly startedAt: Date
  readonly endedAt: Date | null
}

export interface MonitorListPage {
  readonly items: readonly Monitor[]
  readonly lastIncidentByMonitorId: ReadonlyMap<string, MonitorLastIncident>
  readonly totalCount: number
  readonly hasMore: boolean
  readonly limit: number
  readonly offset: number
}

export interface MonitorSearchResult {
  readonly id: MonitorId
  readonly projectId: ProjectId
  readonly projectSlug: string
  readonly projectName: string
  readonly slug: string
  readonly name: string
  readonly system: boolean
  readonly mutedAt: Date | null
}

export interface SavedSearchMonitorSummary {
  readonly savedSearchId: string
  readonly monitorSlug: string
  readonly monitorCount: number
  readonly severities: readonly AlertSeverity[]
  readonly monitors: readonly {
    readonly slug: string
    readonly name: string
    readonly muted: boolean
    readonly severities: readonly AlertSeverity[]
  }[]
}

export interface ListActiveMonitorsInput {
  readonly projectId: ProjectId
  readonly targetType?: MonitorTargetType
  readonly trigger?: MonitorTrigger
}

export interface ListMonitorsForTargetInput {
  readonly projectId: ProjectId
  readonly targetType?: MonitorTargetType
  readonly filterSetContains: FilterSet
}

export interface MonitorRepositoryShape {
  findById(id: MonitorId): Effect.Effect<Monitor, NotFoundError | RepositoryError, SqlClient>
  findBySlug(input: {
    readonly projectId: ProjectId
    readonly slug: string
  }): Effect.Effect<Monitor, NotFoundError | RepositoryError, SqlClient>
  list(input: ListMonitorsRepositoryInput): Effect.Effect<MonitorListPage, RepositoryError, SqlClient>
  searchOrgWide(input: {
    readonly searchQuery?: string
    readonly preferProjectId?: ProjectId
    readonly limit: number
  }): Effect.Effect<readonly MonitorSearchResult[], RepositoryError, SqlClient>
  create(monitor: Monitor): Effect.Effect<void, RepositoryError, SqlClient>
  save(monitor: Monitor): Effect.Effect<void, NotFoundError | RepositoryError, SqlClient>
  setMuted(input: {
    readonly id: MonitorId
    readonly mutedAt: Date | null
  }): Effect.Effect<void, NotFoundError | RepositoryError, SqlClient>
  softDelete(id: MonitorId): Effect.Effect<void, NotFoundError | RepositoryError, SqlClient>
  updateMetadata(input: {
    readonly id: MonitorId
    readonly name: string
    readonly slug: string
    readonly description: string
  }): Effect.Effect<void, NotFoundError | RepositoryError, SqlClient>
  listActiveMonitors(input: ListActiveMonitorsInput): Effect.Effect<readonly Monitor[], RepositoryError, SqlClient>
  lockMonitorForUpdate(monitorId: MonitorId): Effect.Effect<void, RepositoryError, SqlClient>
  listMonitorsForTarget(
    input: ListMonitorsForTargetInput,
  ): Effect.Effect<readonly Monitor[], RepositoryError, SqlClient>
  listSavedSearchMonitorSummaries(
    projectId: ProjectId,
  ): Effect.Effect<readonly SavedSearchMonitorSummary[], RepositoryError, SqlClient>
  listProjectsWithActiveMonitors(): Effect.Effect<readonly ProjectWithActiveMonitors[], RepositoryError, SqlClient>
  countActiveBySlug(input: {
    readonly projectId: ProjectId
    readonly slug: string
    readonly excludeId: MonitorId
  }): Effect.Effect<number, RepositoryError, SqlClient>
}

export class MonitorRepository extends Context.Service<MonitorRepository, MonitorRepositoryShape>()(
  "@domain/monitors/MonitorRepository",
) {}
