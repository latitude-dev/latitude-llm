import {
  type Monitor,
  type MonitorLastIncident,
  MonitorRepository,
  type MonitorSearchResult,
  monitorConfigFilterSet,
  monitorSchema,
  monitorStreamForTargetType,
  type SavedSearchMonitorSummary,
} from "@domain/monitors"
import {
  type MonitorConfig,
  type MonitorId,
  monitorConfigSchema,
  NotFoundError,
  type OrganizationId,
  type ProjectId,
  SqlClient,
  type SqlClientShape,
} from "@domain/shared"
import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  ilike,
  inArray,
  isNotNull,
  isNull,
  max,
  ne,
  sql,
} from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { alertIncidents } from "../schema/alert-incidents.ts"
import { monitors } from "../schema/monitors.ts"
import { projects } from "../schema/projects.ts"
import { nameMatchScore, preferProjectFirst } from "./org-search.ts"

const toMonitor = (row: typeof monitors.$inferSelect): Monitor => {
  const filterSet = monitorConfigFilterSet(row.config) ?? undefined
  return monitorSchema.parse({
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    slug: row.slug,
    name: row.name,
    description: row.description,
    system: row.system,
    target: {
      type: row.targetType,
      id: row.targetId,
      ...(filterSet === undefined ? {} : { filterSet }),
      kind: row.targetType,
      stream: monitorStreamForTargetType(row.targetType),
      savedSearchId: row.targetType === "savedSearch" ? row.targetId : null,
      ...(row.config.metric === undefined ? {} : { metric: row.config.metric }),
    },
    rule: {
      trigger: row.trigger,
      config: row.config,
      severity: row.severity,
    },
    mutedAt: row.mutedAt,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })
}

const toMonitorConfigRow = (config: MonitorConfig): typeof monitors.$inferInsert.config => {
  const parsed = monitorConfigSchema.parse(config)
  return {
    ...(parsed.filterSet === undefined ? {} : { filterSet: parsed.filterSet }),
    ...(parsed.metric === undefined ? {} : { metric: parsed.metric }),
    ...(parsed.condition === undefined ? {} : { condition: parsed.condition }),
  }
}

const toMonitorRow = (monitor: Monitor): typeof monitors.$inferInsert => ({
  id: monitor.id,
  organizationId: monitor.organizationId,
  projectId: monitor.projectId,
  slug: monitor.slug,
  name: monitor.name,
  description: monitor.description,
  system: monitor.system,
  targetType: monitor.target.type,
  targetId: monitor.target.id,
  trigger: monitor.rule.trigger,
  config: toMonitorConfigRow(monitor.rule.config),
  severity: monitor.rule.severity,
  mutedAt: monitor.mutedAt,
  deletedAt: monitor.deletedAt,
  createdAt: monitor.createdAt,
  updatedAt: monitor.updatedAt,
})

export const MonitorRepositoryLive = Layer.effect(
  MonitorRepository,
  Effect.succeed(
    MonitorRepository.of({
      findById: (id) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = yield* sqlClient.query((db) =>
            db
              .select()
              .from(monitors)
              .where(
                and(
                  eq(monitors.organizationId, sqlClient.organizationId),
                  eq(monitors.id, id),
                  isNull(monitors.deletedAt),
                ),
              )
              .limit(1),
          )
          const row = rows[0]
          if (!row) return yield* new NotFoundError({ entity: "Monitor", id })
          return toMonitor(row)
        }),
      findBySlug: ({ projectId, slug }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = yield* sqlClient.query((db) =>
            db
              .select()
              .from(monitors)
              .where(
                and(
                  eq(monitors.organizationId, sqlClient.organizationId),
                  eq(monitors.projectId, projectId),
                  eq(monitors.slug, slug),
                  isNull(monitors.deletedAt),
                ),
              )
              .limit(1),
          )
          const row = rows[0]
          if (!row) return yield* new NotFoundError({ entity: "Monitor", id: slug })
          return toMonitor(row)
        }),
      list: ({ projectId, limit, offset, searchQuery, system }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const { organizationId } = sqlClient
          const where = and(
            eq(monitors.organizationId, organizationId),
            eq(monitors.projectId, projectId),
            isNull(monitors.deletedAt),
            searchQuery ? ilike(monitors.name, `%${searchQuery}%`) : undefined,
            system === undefined ? undefined : eq(monitors.system, system),
          )

          const [rows, totals] = yield* sqlClient.query((db) => {
            const lastIncident = db
              .select({
                monitorId: alertIncidents.sourceId,
                lastStartedAt: max(alertIncidents.startedAt).as("last_started_at"),
              })
              .from(alertIncidents)
              .where(and(eq(alertIncidents.sourceType, "monitor"), eq(alertIncidents.organizationId, organizationId)))
              .groupBy(alertIncidents.sourceId)
              .as("last_incident")

            const itemsPromise = db
              .select(getTableColumns(monitors))
              .from(monitors)
              .leftJoin(lastIncident, eq(lastIncident.monitorId, monitors.id))
              .where(where)
              .orderBy(sql`${lastIncident.lastStartedAt} desc nulls last`, desc(monitors.createdAt), asc(monitors.id))
              .limit(limit)
              .offset(offset)
            const totalPromise = db.select({ value: count() }).from(monitors).where(where)
            return Promise.all([itemsPromise, totalPromise])
          })

          const totalCount = Number(totals[0]?.value ?? 0)
          if (rows.length === 0) {
            return { items: [], lastIncidentByMonitorId: new Map(), totalCount, hasMore: false, limit, offset }
          }

          const ids = rows.map((row) => row.id)
          const incidentRows = yield* sqlClient.query((db) =>
            db
              .select({
                monitorId: alertIncidents.sourceId,
                incidentId: alertIncidents.id,
                startedAt: alertIncidents.startedAt,
                endedAt: alertIncidents.endedAt,
              })
              .from(alertIncidents)
              .where(
                and(
                  eq(alertIncidents.organizationId, organizationId),
                  eq(alertIncidents.sourceType, "monitor"),
                  inArray(alertIncidents.sourceId, ids),
                ),
              )
              .orderBy(asc(alertIncidents.sourceId), desc(alertIncidents.endedAt), desc(alertIncidents.id)),
          )
          const lastIncidentByMonitorId = new Map<string, MonitorLastIncident>()
          for (const row of incidentRows) {
            if (!lastIncidentByMonitorId.has(row.monitorId)) {
              lastIncidentByMonitorId.set(row.monitorId, {
                id: row.incidentId,
                startedAt: row.startedAt,
                endedAt: row.endedAt,
              })
            }
          }

          return {
            items: rows.map(toMonitor),
            lastIncidentByMonitorId,
            totalCount,
            hasMore: offset + rows.length < totalCount,
            limit,
            offset,
          }
        }),
      searchOrgWide: ({ searchQuery, preferProjectId, limit }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const trimmed = searchQuery?.trim()
          const where = and(
            eq(monitors.organizationId, sqlClient.organizationId),
            isNull(monitors.deletedAt),
            isNull(projects.deletedAt),
            trimmed ? ilike(monitors.name, `%${trimmed}%`) : undefined,
          )
          const orderBy = [
            ...preferProjectFirst(monitors.projectId, preferProjectId),
            ...(trimmed
              ? [
                  desc(nameMatchScore(monitors.name, trimmed)),
                  desc(monitors.system),
                  desc(monitors.createdAt),
                  asc(monitors.id),
                ]
              : [desc(monitors.system), desc(monitors.createdAt), asc(monitors.id)]),
          ]

          const rows = yield* sqlClient.query((db) =>
            db
              .select({
                id: monitors.id,
                projectId: monitors.projectId,
                projectSlug: projects.slug,
                projectName: projects.name,
                slug: monitors.slug,
                name: monitors.name,
                system: monitors.system,
                mutedAt: monitors.mutedAt,
              })
              .from(monitors)
              .innerJoin(projects, eq(projects.id, monitors.projectId))
              .where(where)
              .orderBy(...orderBy)
              .limit(limit),
          )

          return rows.map(
            (row): MonitorSearchResult => ({
              id: row.id as MonitorId,
              projectId: row.projectId as ProjectId,
              projectSlug: row.projectSlug,
              projectName: row.projectName,
              slug: row.slug,
              name: row.name,
              system: row.system,
              mutedAt: row.mutedAt,
            }),
          )
        }),
      create: (monitor) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient.query((db) => db.insert(monitors).values(toMonitorRow(monitor)))
        }),
      save: (monitor) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const updated = yield* sqlClient.query((db) =>
            db
              .update(monitors)
              .set(toMonitorRow(monitor))
              .where(
                and(
                  eq(monitors.organizationId, sqlClient.organizationId),
                  eq(monitors.id, monitor.id),
                  isNull(monitors.deletedAt),
                ),
              )
              .returning({ id: monitors.id }),
          )
          if (updated.length === 0) return yield* new NotFoundError({ entity: "Monitor", id: monitor.id })
        }),
      setMuted: ({ id, mutedAt }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const updated = yield* sqlClient.query((db) =>
            db
              .update(monitors)
              .set({ mutedAt, updatedAt: new Date() })
              .where(
                and(
                  eq(monitors.organizationId, sqlClient.organizationId),
                  eq(monitors.id, id),
                  isNull(monitors.deletedAt),
                ),
              )
              .returning({ id: monitors.id }),
          )
          if (updated.length === 0) return yield* new NotFoundError({ entity: "Monitor", id })
        }),
      softDelete: (id) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const now = new Date()
          const deleted = yield* sqlClient.query((db) =>
            db
              .update(monitors)
              .set({ deletedAt: now, updatedAt: now })
              .where(
                and(
                  eq(monitors.organizationId, sqlClient.organizationId),
                  eq(monitors.id, id),
                  isNull(monitors.deletedAt),
                ),
              )
              .returning({ id: monitors.id }),
          )
          if (deleted.length === 0) return yield* new NotFoundError({ entity: "Monitor", id })
        }),
      updateMetadata: ({ id, name, slug, description }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const updated = yield* sqlClient.query((db) =>
            db
              .update(monitors)
              .set({ name, slug, description, updatedAt: new Date() })
              .where(
                and(
                  eq(monitors.organizationId, sqlClient.organizationId),
                  eq(monitors.id, id),
                  isNull(monitors.deletedAt),
                ),
              )
              .returning({ id: monitors.id }),
          )
          if (updated.length === 0) return yield* new NotFoundError({ entity: "Monitor", id })
        }),
      listActiveMonitors: ({ projectId, targetType, trigger }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = yield* sqlClient.query((db) =>
            db
              .select()
              .from(monitors)
              .where(
                and(
                  eq(monitors.organizationId, sqlClient.organizationId),
                  eq(monitors.projectId, projectId),
                  targetType ? eq(monitors.targetType, targetType) : undefined,
                  trigger ? eq(monitors.trigger, trigger) : undefined,
                  isNull(monitors.deletedAt),
                ),
              )
              .orderBy(asc(monitors.createdAt), asc(monitors.id)),
          )
          return rows.map(toMonitor)
        }),
      lockMonitorForUpdate: (monitorId) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient.query((db) =>
            db
              .select({ id: monitors.id })
              .from(monitors)
              .where(and(eq(monitors.organizationId, sqlClient.organizationId), eq(monitors.id, monitorId)))
              .for("update"),
          )
        }),
      listMonitorsForTarget: ({ projectId, targetType, filterSetContains }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = yield* sqlClient.query((db) =>
            db
              .select()
              .from(monitors)
              .where(
                and(
                  eq(monitors.organizationId, sqlClient.organizationId),
                  eq(monitors.projectId, projectId),
                  targetType ? eq(monitors.targetType, targetType) : undefined,
                  sql`coalesce(${monitors.config}->'filterSet', '{}'::jsonb) @> ${JSON.stringify(filterSetContains)}::jsonb`,
                  isNull(monitors.deletedAt),
                ),
              )
              .orderBy(desc(monitors.createdAt), asc(monitors.id)),
          )
          return rows.map(toMonitor)
        }),
      listSavedSearchMonitorSummaries: (projectId) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = yield* sqlClient.query((db) =>
            db
              .select()
              .from(monitors)
              .where(
                and(
                  eq(monitors.organizationId, sqlClient.organizationId),
                  eq(monitors.projectId, projectId),
                  eq(monitors.targetType, "savedSearch"),
                  isNotNull(monitors.targetId),
                  isNull(monitors.deletedAt),
                ),
              )
              .orderBy(asc(monitors.targetId), asc(monitors.createdAt), asc(monitors.id)),
          )

          const summaries = new Map<string, SavedSearchMonitorSummary>()
          for (const row of rows) {
            if (!row.targetId) continue
            const monitor = toMonitor(row)
            const existing = summaries.get(row.targetId)
            const entry = {
              slug: monitor.slug,
              name: monitor.name,
              muted: monitor.mutedAt !== null,
              severities: [monitor.rule.severity],
            }
            summaries.set(row.targetId, {
              savedSearchId: row.targetId,
              monitorSlug: existing?.monitorSlug ?? monitor.slug,
              monitorCount: (existing?.monitorCount ?? 0) + 1,
              severities: [...(existing?.severities ?? []), monitor.rule.severity],
              monitors: [...(existing?.monitors ?? []), entry],
            })
          }
          return [...summaries.values()]
        }),
      listProjectsWithActiveMonitors: () =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = yield* sqlClient.query((db) =>
            db
              .selectDistinct({ organizationId: monitors.organizationId, projectId: monitors.projectId })
              .from(monitors)
              .where(isNull(monitors.deletedAt)),
          )
          return rows.map((row) => ({
            organizationId: row.organizationId as OrganizationId,
            projectId: row.projectId as ProjectId,
          }))
        }),
      countActiveBySlug: ({ projectId, slug, excludeId }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = yield* sqlClient.query((db) =>
            db
              .select({ value: count() })
              .from(monitors)
              .where(
                and(
                  eq(monitors.organizationId, sqlClient.organizationId),
                  eq(monitors.projectId, projectId),
                  eq(monitors.slug, slug),
                  ne(monitors.id, excludeId),
                  isNull(monitors.deletedAt),
                ),
              ),
          )
          return Number(rows[0]?.value ?? 0)
        }),
    }),
  ),
)
