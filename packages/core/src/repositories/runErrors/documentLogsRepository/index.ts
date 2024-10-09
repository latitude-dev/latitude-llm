import { and, eq, getTableColumns, sql } from 'drizzle-orm'

import { ErrorableEntity } from '../../../browser'
import { NotFoundError, Result } from '../../../lib'
import {
  commits,
  documentLogs,
  projects,
  runErrors,
  workspaces,
} from '../../../schema'
import { DocumentLogWithMetadata } from '../../documentLogsRepository'
import Repository from '../../repository'
import { RunErrorField } from '../evaluationResultsRepository'

const tt = {
  ...getTableColumns(documentLogs),
  error: {
    code: sql<string>`${runErrors.code}`.as('document_log_error_code'),
    message: sql<string>`${runErrors.message}`.as('document_log_error_message'),
    details: sql<string>`${runErrors.details}`.as('document_log_error_details'),
  },
}
export type DocumentLogWithMetadataAndError = DocumentLogWithMetadata & {
  error: RunErrorField
}

export class DocumentLogsWithErrorsRepository extends Repository<
  typeof tt,
  DocumentLogWithMetadataAndError
> {
  get scope() {
    return this.db
      .select(tt)
      .from(documentLogs)
      .innerJoin(commits, eq(commits.id, documentLogs.commitId))
      .innerJoin(projects, eq(projects.id, commits.projectId))
      .innerJoin(workspaces, eq(workspaces.id, projects.workspaceId))
      .leftJoin(
        runErrors,
        and(
          eq(runErrors.errorableUuid, documentLogs.uuid),
          eq(runErrors.errorableType, ErrorableEntity.DocumentLog),
        ),
      )
      .where(eq(workspaces.id, this.workspaceId))
      .as('documentLogsWithErrorsScope')
  }

  async findByUuid(uuid: string) {
    const result = await this.db
      .select()
      .from(this.scope)
      .where(eq(this.scope.uuid, uuid))

    if (!result.length) {
      return Result.error(
        new NotFoundError(`DocumentLog not found with uuid ${uuid}`),
      )
    }

    return Result.ok(result[0]!)
  }
}
