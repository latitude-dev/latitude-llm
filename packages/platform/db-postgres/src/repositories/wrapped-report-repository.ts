import {
  NotFoundError,
  OrganizationId,
  ProjectId,
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
} from "@domain/spans"
import { eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { claudeCodeWrappedReports } from "../schema/claude-code-wrapped-reports.ts"

const parseReportBlob = (
  blob: unknown,
  version: ReportVersion,
): Effect.Effect<Report, ReturnType<typeof toRepositoryError>> =>
  Effect.try({
    try: () => SCHEMA_BY_VERSION[version].parse(blob) as Report,
    catch: (e) => toRepositoryError(e, `parseReport(v${version})`),
  })

const toDomainRecord = (
  row: typeof claudeCodeWrappedReports.$inferSelect,
): Effect.Effect<WrappedReportRecord, ReturnType<typeof toRepositoryError>> =>
  Effect.gen(function* () {
    // Defence in depth: the schema column is typed as ReportVersion at
    // insert, but a stored row could in principle hold a version we no
    // longer know about (e.g. a downgrade after a forward migration).
    const version = row.reportVersion
    if (!(version in SCHEMA_BY_VERSION)) {
      return yield* Effect.fail(toRepositoryError(new Error(`Unknown report_version ${version}`), "findById"))
    }
    const report = yield* parseReportBlob(row.report, version)
    return {
      id: WrappedReportId(row.id),
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
          db.insert(claudeCodeWrappedReports).values({
            id: record.id,
            organizationId: record.organizationId,
            projectId: record.projectId,
            windowStart: record.windowStart,
            windowEnd: record.windowEnd,
            ownerName: record.ownerName,
            reportVersion: record.reportVersion ?? CURRENT_REPORT_VERSION,
            report: record.report,
          }),
        )
      }),

    findById: (id: WrappedReportIdType) =>
      Effect.gen(function* () {
        const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
        // Cross-org read — the public share URL has no org context. The
        // caller MUST build the SqlClient with `OrganizationId("system")`
        // so RLS is bypassed; otherwise the row will be invisible.
        const [row] = yield* sqlClient.query((db) =>
          db.select().from(claudeCodeWrappedReports).where(eq(claudeCodeWrappedReports.id, id)).limit(1),
        )

        if (!row) return yield* new NotFoundError({ entity: "WrappedReport", id })

        return yield* toDomainRecord(row)
      }),
  }),
)
