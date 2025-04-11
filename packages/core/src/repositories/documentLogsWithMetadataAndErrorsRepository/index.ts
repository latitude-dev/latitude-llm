import { and, eq, getTableColumns, isNull, sql, sum } from 'drizzle-orm'

import { ErrorableEntity } from '../../browser'
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

export class DocumentLogsWithMetadataAndErrorsRepository extends Repository<DocumentLogWithMetadataAndError> {
  get scopeFilter() {
    return eq(workspaces.id, this.workspaceId)
  }

  get scope() {
    return this.db
      .select({
        ...getTableColumns(documentLogs),
        commit: getTableColumns(commits),
        tokens: sum(providerLogs.tokens).mapWith(Number).as('tokens'),
        duration: sum(providerLogs.duration)
          .mapWith(Number)
          .as('duration_in_ms'),
        costInMillicents: sum(providerLogs.costInMillicents)
          .mapWith(Number)
          .as('cost_in_millicents'),
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
}
