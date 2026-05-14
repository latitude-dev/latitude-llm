import {
  NotFoundError,
  OrganizationId,
  ProjectId,
  type ProjectId as ProjectIdType,
  SqlClient,
  type SqlClientShape,
  toRepositoryError,
  WrappedReportId,
  type WrappedReportId as WrappedReportIdType,
} from "@domain/shared"
import {
  CURRENT_REPORT_VERSION,
  type Report,
  type ReportVersion,
  SCHEMA_BY_VERSION,
  type WrappedReportRecord,
  WrappedReportRepository,
  type WrappedReportSummary,
  type WrappedReportType,
} from "@domain/spans"
import { and, desc, eq, gte } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { wrappedReports } from "../schema/wrapped-reports.ts"

const parseReportBlob = (
  blob: unknown,
  version: ReportVersion,
): Effect.Effect<Report, ReturnType<typeof toRepositoryError>> =>
  Effect.try({
    try: () => SCHEMA_BY_VERSION[version].parse(blob) as Report,
    catch: (e) => toRepositoryError(e, `parseReport(v${version})`),
  })

const toDomainRecord = (
  row: typeof wrappedReports.$inferSelect,
): Effect.Effect<WrappedReportRecord, ReturnType<typeof toRepositoryError>> =>
  Effect.gen(function* () {
    // Defence in depth: the schema column is typed as ReportVersion at
    // insert, but a stored row could in principle hold a version we no
    // longer know about (e.g. a downgrade after a forward migration).
    // Today only the `claude_code` type's schema dictionary is in scope;
    // future types will dispatch on `row.type + row.reportVersion`.
    const version = row.reportVersion
    if (!(version in SCHEMA_BY_VERSION)) {
      return yield* Effect.fail(toRepositoryError(new Error(`Unknown report_version ${version}`), "findById"))
    }
    const report = yield* parseReportBlob(row.report, version)
    return {
      id: WrappedReportId(row.id),
      type: row.type,
      organizationId: OrganizationId(row.organizationId),
      projectId: ProjectId(row.projectId),
      windowStart: row.windowStart,
      windowEnd: row.windowEnd,
      ownerName: row.ownerName,
      reportVersion: version,
      report,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  })

export const WrappedReportRepositoryLive = Layer.effect(
  WrappedReportRepository,
  Effect.succeed({
    save: (record: WrappedReportRecord) =>
      Effect.gen(function* () {
        const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
        // Cross-org write — the record itself carries the organizationId
        // it should be filed under, not the current SqlClient context.
        yield* sqlClient.query((db) =>
          db.insert(wrappedReports).values({
            id: record.id,
            type: record.type,
            organizationId: record.organizationId,
            projectId: record.projectId,
            windowStart: record.windowStart,
            windowEnd: record.windowEnd,
            ownerName: record.ownerName,
            reportVersion: record.reportVersion ?? CURRENT_REPORT_VERSION,
            report: record.report,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt,
          }),
        )
      }),

    findById: (id: WrappedReportIdType) =>
      Effect.gen(function* () {
        const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
        // Cross-org read — the public share URL has no org context. The
        // caller MUST provide the admin Postgres client (a role with
        // BYPASSRLS) so the policy doesn't filter the row out; the
        // `OrganizationId("system")` sentinel alone is not enough —
        // `SqlClientLive` simply skips setting `app.current_organization_id`
        // for `system`, which makes the RLS predicate evaluate to false
        // on a normal-privilege connection.
        const [row] = yield* sqlClient.query((db) =>
          db.select().from(wrappedReports).where(eq(wrappedReports.id, id)).limit(1),
        )

        if (!row) return yield* new NotFoundError({ entity: "WrappedReport", id })

        return yield* toDomainRecord(row)
      }),

    findLatestForProject: ({
      projectId,
      type,
      sinceCreatedAt,
    }: {
      projectId: ProjectIdType
      type: WrappedReportType
      sinceCreatedAt: Date
    }): Effect.Effect<WrappedReportSummary | null, ReturnType<typeof toRepositoryError>, SqlClient> =>
      Effect.gen(function* () {
        const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
        // Org-scoped read — the session SqlClient carries the caller's org
        // and the table's RLS policy enforces isolation. The (type,
        // project_id, created_at) compound index makes this a single seek.
        // No JSONB validation here: the caller only needs the id + timestamp
        // for navigation.
        const [row] = yield* sqlClient.query((db) =>
          db
            .select({ id: wrappedReports.id, createdAt: wrappedReports.createdAt })
            .from(wrappedReports)
            .where(
              and(
                eq(wrappedReports.type, type),
                eq(wrappedReports.projectId, projectId),
                gte(wrappedReports.createdAt, sinceCreatedAt),
              ),
            )
            .orderBy(desc(wrappedReports.createdAt))
            .limit(1),
        )
        if (!row) return null
        return { id: WrappedReportId(row.id), createdAt: row.createdAt }
      }),
  }),
)
