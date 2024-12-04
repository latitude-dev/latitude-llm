import { and, count, eq, getTableColumns, gte, isNull } from 'drizzle-orm'

import { Commit, DocumentLog, ErrorableEntity } from '../../browser'
import { NotFoundError, Result } from '../../lib'
import {
  commits,
  documentLogs,
  projects,
  runErrors,
  workspaces,
} from '../../schema'
import Repository from '../repositoryV2'

export type DocumentLogWithMetadata = DocumentLog & {
  commit: Commit
  tokens: number | null
  duration: number | null
  costInMillicents: number | null
}

const tt = getTableColumns(documentLogs)

export class DocumentLogsRepository extends Repository<DocumentLog> {
  get scope() {
    return this.db
      .select(tt)
      .from(documentLogs)
      .innerJoin(
        commits,
        and(isNull(commits.deletedAt), eq(commits.id, documentLogs.commitId)),
      )
      .innerJoin(projects, eq(projects.id, commits.projectId))
      .innerJoin(workspaces, eq(workspaces.id, projects.workspaceId))
      .leftJoin(
        runErrors,
        and(
          eq(runErrors.errorableUuid, documentLogs.uuid),
          eq(runErrors.errorableType, ErrorableEntity.DocumentLog),
        ),
      )
      .where(and(isNull(runErrors.id), eq(workspaces.id, this.workspaceId)))
      .$dynamic()
  }

  async findByUuid(uuid: string) {
    const result = await this.scope.where(eq(documentLogs.uuid, uuid))

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
      .where(eq(documentLogs.uuid, documentUuid))

    return result[0]?.count ?? 0 > 0
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
      .where(and(isNull(runErrors.id), gte(documentLogs.createdAt, minDate)))

    return result[0]?.count ?? 0
  }
}
