import {
  and,
  eq,
  getTableColumns,
  inArray,
  isNull,
  sql,
  sum,
  SQL,
  desc,
  lt,
} from 'drizzle-orm'

import {
  DocumentLogFilterOptions,
  ErrorableEntity,
  ExtendedDocumentLogFilterOptions,
} from '../../browser'
import {
  commits,
  documentLogs,
  projects,
  providerLogs,
  runErrors,
  workspaces,
} from '../../schema'
import Repository from '../repositoryV2'
import { DocumentLogWithMetadataAndError } from '../runErrors/documentLogsRepository'
import { NotFoundError } from './../../lib/errors'
import { Result } from './../../lib/Result'
import { PromisedResult } from '../../lib/Transaction'
import { buildLogsFilterSQLConditions } from '../../services/documentLogs/logsFilterUtils'
import { calculateOffset } from '../../lib/pagination'

export type DocumentLogsWithMetadataAndErrorsCursor = Date

// TODO: remove
export class DocumentLogsWithMetadataAndErrorsRepository extends Repository<DocumentLogWithMetadataAndError> {
  get scopeFilter() {
    return eq(workspaces.id, this.workspaceId)
  }

  get scope() {
    return this.db
      .select({
        ...getTableColumns(documentLogs),
        commit: getTableColumns(commits),
        // TODO: Denormalize these aggregations and persist them at write time
        tokens: sum(providerLogs.tokens).mapWith(Number).as('tokens'),
        duration: sum(providerLogs.duration)
          .mapWith(Number)
          .as('duration_in_ms'),
        costInMillicents: sum(providerLogs.costInMillicents)
          .mapWith(Number)
          .as('cost_in_millicents'),
        // TODO: Denormalize the errors and persist them at write time
        error: {
          code: sql<string>`${runErrors.code}`.as('document_log_error_code'),
          message: sql<string>`${runErrors.message}`.as(
            'document_log_error_message',
          ),
          details: sql<string>`${runErrors.details}`.as(
            'document_log_error_details',
          ),
        },
      })
      .from(documentLogs)
      .innerJoin(
        commits,
        and(eq(commits.id, documentLogs.commitId), isNull(commits.deletedAt)),
      )
      .innerJoin(projects, eq(projects.id, commits.projectId))
      .innerJoin(workspaces, eq(workspaces.id, projects.workspaceId))
      .leftJoin(
        providerLogs,
        eq(providerLogs.documentLogUuid, documentLogs.uuid),
      )
      .leftJoin(
        runErrors,
        and(
          eq(runErrors.errorableUuid, documentLogs.uuid),
          eq(runErrors.errorableType, ErrorableEntity.DocumentLog),
        ),
      )
      .where(this.scopeFilter)
      .groupBy(
        commits.id,
        documentLogs.id,
        runErrors.code,
        runErrors.details,
        runErrors.message,
      )
      .$dynamic()
  }

  async findByUuid(uuid: string) {
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

  private getConditions(
    documentUuid: string,
    extendedFilterOptions?: ExtendedDocumentLogFilterOptions,
  ) {
    return [
      eq(documentLogs.documentUuid, documentUuid),
      extendedFilterOptions
        ? buildLogsFilterSQLConditions(extendedFilterOptions)
        : undefined,
    ].filter(Boolean)
  }

  private getOrdering(
    extendedFilterOptions?: ExtendedDocumentLogFilterOptions,
  ) {
    return [
      extendedFilterOptions?.customIdentifier
        ? desc(
            sql`similarity(${documentLogs.customIdentifier}, ${extendedFilterOptions.customIdentifier})`,
          )
        : undefined,
      desc(documentLogs.createdAt),
    ].filter(Boolean) as SQL<unknown>[]
  }

  private getNextCursor(
    result: DocumentLogWithMetadataAndError[],
    limit: number,
  ) {
    return result.length < limit
      ? undefined
      : result[result.length - 1]?.createdAt
  }

  async findInDocumentPaginated(
    documentUuid: string,
    page: number,
    size: number,
    extendedFilterOptions?: ExtendedDocumentLogFilterOptions,
  ): PromisedResult<DocumentLogWithMetadataAndError[]> {
    const offset = calculateOffset(page, size)
    const conditions = this.getConditions(documentUuid, extendedFilterOptions)
    const ordering = this.getOrdering(extendedFilterOptions)
    const result = await this.scope
      .where(and(this.scopeFilter, ...conditions))
      .orderBy(...ordering)
      .limit(size)
      .offset(offset)
    return Result.ok(result)
  }

  async findInDocumentWithCursor(
    documentUuid: string,
    limit: number,
    cursor?: DocumentLogsWithMetadataAndErrorsCursor,
    extendedFilterOptions?: ExtendedDocumentLogFilterOptions,
  ): PromisedResult<{
    logs: DocumentLogWithMetadataAndError[]
    nextCursor?: DocumentLogsWithMetadataAndErrorsCursor
  }> {
    const currentCursor = cursor ?? new Date()
    const conditions = [
      ...this.getConditions(documentUuid, extendedFilterOptions),
      lt(documentLogs.createdAt, currentCursor),
    ]
    const ordering = this.getOrdering(extendedFilterOptions)
    const result = await this.scope
      .where(and(this.scopeFilter, ...conditions))
      .orderBy(...ordering)
      .limit(limit)
    const nextCursor = this.getNextCursor(result, limit)
    return Result.ok({
      logs: result,
      nextCursor,
    })
  }
}
