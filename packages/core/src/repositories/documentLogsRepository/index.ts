import { and, count, eq, getTableColumns, gte, isNull, sql } from 'drizzle-orm'

import { DocumentLog, ErrorableEntity, LogSources } from '../../browser'
import { commits, documentLogs, projects, runErrors } from '../../schema'
import Repository from '../repositoryV2'
import { NotFoundError } from './../../lib/errors'
import { Result } from './../../lib/Result'

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

    const result = await this.scope.where(
      and(this.scopeFilter, eq(documentLogs.uuid, uuid)),
    )

    if (!result.length) {
      return Result.error(
        new NotFoundError(`DocumentLog not found with uuid ${uuid}`),
      )
    }

    return Result.ok(result[0]!)
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
WHERE ${documentUuid} = ${documentLogs.documentUuid};
`,
    )

    try {
      const rows = result.rows.reduce((max, row) => {
        const plan = row['QUERY PLAN'] as string
        const matches = plan.match(/rows=(\d+)/g)

        let count = 0
        if (matches) {
          count = Math.max(
            ...matches.map((match) => parseInt(match.replace('rows=', ''), 10)),
          )
        }

        return Math.max(max, count)
      }, 0)

      return Result.ok(rows)
    } catch (error) {
      return Result.ok(0)
    }
  }
}
