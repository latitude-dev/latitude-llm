import { and, eq, getTableColumns, isNull, sql } from 'drizzle-orm'

import { type DocumentLogWithMetadataAndError, ErrorableEntity } from '../../../browser'
import { NotFoundError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import { commits, documentLogs, projects, runErrors, workspaces } from '../../../schema'
import Repository from '../../repositoryV2'

const tt = {
  ...getTableColumns(documentLogs),
  error: {
    code: sql<string>`${runErrors.code}`.as('document_log_error_code'),
    message: sql<string>`${runErrors.message}`.as('document_log_error_message'),
    details: sql<string>`${runErrors.details}`.as('document_log_error_details'),
  },
}

export type DocumentLogWithErrorScope = typeof DocumentLogsWithErrorsRepository.prototype.scope

export class DocumentLogsWithErrorsRepository extends Repository<DocumentLogWithMetadataAndError> {
  get scopeFilter() {
    return eq(workspaces.id, this.workspaceId)
  }

  get scope() {
    return this.db
      .select(tt)
      .from(documentLogs)
      .innerJoin(commits, and(eq(commits.id, documentLogs.commitId), isNull(commits.deletedAt)))
      .innerJoin(projects, eq(projects.id, commits.projectId))
      .innerJoin(workspaces, eq(workspaces.id, projects.workspaceId))
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

  async findByUuid(uuid: string) {
    const result = await this.scope.where(and(this.scopeFilter, eq(documentLogs.uuid, uuid)))

    if (!result.length) {
      return Result.error(new NotFoundError(`DocumentLog not found with uuid ${uuid}`))
    }

    return Result.ok(result[0]!)
  }
}
