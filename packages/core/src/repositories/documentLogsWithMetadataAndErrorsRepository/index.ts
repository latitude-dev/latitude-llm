import { and, eq, getTableColumns, isNull, sql, sum } from 'drizzle-orm'

import { DocumentLogWithMetadataAndError } from '../../schema/types'
import { ErrorableEntity } from '../../constants'
import { NotFoundError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import { commits } from '../../schema/models/commits'
import { documentLogs } from '../../schema/models/documentLogs'
import { projects } from '../../schema/models/projects'
import { providerLogs } from '../../schema/models/providerLogs'
import { runErrors } from '../../schema/models/runErrors'
import { workspaces } from '../../schema/models/workspaces'
import Repository from '../repositoryV2'

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
}
