import { and, eq, getTableColumns, isNull } from 'drizzle-orm'

import { Commit, DocumentLog, ErrorableEntity } from '../../browser'
import { NotFoundError, Result } from '../../lib'
import {
  commits,
  documentLogs,
  projects,
  runErrors,
  workspaces,
} from '../../schema'
import Repository from '../repository'

export type DocumentLogWithMetadata = DocumentLog & {
  commit: Commit
  tokens: number | null
  duration: number | null
  costInMillicents: number | null
}

const tt = getTableColumns(documentLogs)

export class DocumentLogsRepository extends Repository<typeof tt, DocumentLog> {
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
      .where(and(isNull(runErrors.id), eq(workspaces.id, this.workspaceId)))
      .as('documentLogsScope')
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
