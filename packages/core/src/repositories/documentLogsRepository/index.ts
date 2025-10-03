import {
  and,
  count,
  eq,
  getTableColumns,
  gte,
  inArray,
  isNull,
  sql,
} from 'drizzle-orm'
import { DocumentLog, ErrorableEntity, LogSources } from '../../constants'
import { NotFoundError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import rowsFromQueryPlan from '../../lib/rowsFromQueryPlan'
import { commits } from '../../schema/models/commits'
import { documentLogs } from '../../schema/models/documentLogs'
import { projects } from '../../schema/models/projects'
import { runErrors } from '../../schema/models/runErrors'
import Repository from '../repositoryV2'

const tt = getTableColumns(documentLogs)

export class DocumentLogsRepository extends Repository<DocumentLog> {
  get scopeFilter() {
    return and(isNull(runErrors.id), eq(projects.workspaceId, this.workspaceId))
  }

  get scope() {
    return this.db
      .select(tt)
      .from(documentLogs)
      .innerJoin(
        commits,
        and(isNull(commits.deletedAt), eq(commits.id, documentLogs.commitId)),
      )
      .innerJoin(projects, eq(projects.id, commits.projectId))
      .leftJoin(
        runErrors,
        and(
          eq(runErrors.errorableUuid, documentLogs.uuid),
          eq(runErrors.errorableType, ErrorableEntity.DocumentLog),
        ),
      )
      .where(this.scopeFilter)
      .$dynamic()
  }

  async findByUuid(uuid: string | undefined) {
    if (!uuid) {
      return Result.error(new NotFoundError('DocumentLog not found'))
    }

    try {
      const result = await this.scope.where(
        and(this.scopeFilter, eq(documentLogs.uuid, uuid)),
      )

      if (!result.length) {
        return Result.error(
          new NotFoundError(`DocumentLog not found with uuid ${uuid}`),
        )
      }

      return Result.ok(result[0]!)
    } catch (err) {
      console.log(err)

      return Result.error(err as Error)
    }
  }

  async totalCountSinceDate(minDate: Date) {
    // TODO(perf): Slow query, joining with 3 tables in potentially many logs
    const result = await this.db
      .select({
        count: count(documentLogs.id),
      })
      .from(documentLogs)
      .innerJoin(commits, eq(commits.id, documentLogs.commitId))
      .innerJoin(
        projects,
        and(
          eq(projects.id, commits.projectId),
          eq(projects.workspaceId, this.workspaceId),
        ),
      )
      .leftJoin(
        runErrors,
        and(
          eq(runErrors.errorableUuid, documentLogs.uuid),
          eq(runErrors.errorableType, ErrorableEntity.DocumentLog),
        ),
      )
      .where(and(this.scopeFilter, gte(documentLogs.createdAt, minDate)))

    return result[0]?.count ?? 0
  }

  async findByFields({
    documentUuid,
    source,
    customIdentifier,
  }: {
    documentUuid?: string
    source?: LogSources
    customIdentifier?: string
  }) {
    const filters = [
      documentUuid && eq(documentLogs.documentUuid, documentUuid),
      source && eq(documentLogs.source, source),
      customIdentifier && eq(documentLogs.customIdentifier, customIdentifier),
    ].filter((v) => !!v && typeof v !== 'string')

    if (!filters.length) return []

    const results = await this.scope.where(and(this.scopeFilter, ...filters))

    return results
  }

  async approximatedCount({ documentUuid }: { documentUuid: string }) {
    const result = await this.db.execute(
      sql`
EXPLAIN SELECT COUNT(*)
FROM ${documentLogs}
WHERE ${documentLogs.documentUuid} = ${documentUuid};
`,
    )

    const rows = rowsFromQueryPlan(result)

    return Result.ok(rows)
  }

  async approximatedCountByProject({ projectId }: { projectId: number }) {
    const commitIds = await this.db
      .select({ id: commits.id })
      .from(commits)
      .where(eq(commits.projectId, projectId))
      .then((r) => r.map(({ id }) => id))
    if (!commitIds.length) return Result.ok(0)

    const result = await this.db.execute(
      sql`
EXPLAIN SELECT COUNT(*)
FROM ${documentLogs}
WHERE ${documentLogs.commitId} IN (${sql.join(commitIds, sql`, `)});
`,
    )

    const rows = rowsFromQueryPlan(result)

    return Result.ok(rows)
  }

  async hasLogs({ documentUuid }: { documentUuid: string }) {
    const result = await this.db
      .select({ id: documentLogs.id })
      .from(documentLogs)
      .where(eq(documentLogs.documentUuid, documentUuid))
      .limit(1)
      .then((r) => !!r[0])

    return Result.ok(result)
  }

  async hasLogsByProject({ projectId }: { projectId: number }) {
    const commitIds = await this.db
      .select({ id: commits.id })
      .from(commits)
      .where(eq(commits.projectId, projectId))
      .then((r) => r.map(({ id }) => id))
    if (!commitIds.length) return Result.ok(false)

    const result = await this.db
      .select({ id: documentLogs.id })
      .from(documentLogs)
      .where(inArray(documentLogs.commitId, commitIds))
      .limit(1)
      .then((r) => !!r[0])

    return Result.ok(result)
  }
}
