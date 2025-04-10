import { and, count, eq, getTableColumns, gte, isNull } from 'drizzle-orm'

import { Commit, DocumentLog, ErrorableEntity, LogSources } from '../../browser'
import { commits, documentLogs, projects, runErrors } from '../../schema'
import Repository from '../repositoryV2'
import { NotFoundError } from './../../lib/errors'
import { Result } from './../../lib/Result'

export type DocumentLogWithMetadata = DocumentLog & {
  commit: Commit
  tokens: number | null
  duration: number | null
  costInMillicents: number | null
}

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

  async hasLogs(documentUuid: string) {
    const result = await this.db
      .select({
        count: count(documentLogs.id),
      })
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
      .where(
        and(
          eq(projects.workspaceId, this.workspaceId),
          eq(documentLogs.documentUuid, documentUuid),
        ),
      )
      .$dynamic()

    const firstValue = result[0]

    if (!firstValue) return false

    return firstValue.count > 0
  }

  async totalCountSinceDate(minDate: Date) {
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
}
