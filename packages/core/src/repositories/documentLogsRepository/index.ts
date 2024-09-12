import { eq, getTableColumns } from 'drizzle-orm'

import { Commit, DocumentLog } from '../../browser'
import { NotFoundError, Result, TypedResult } from '../../lib'
import { commits, documentLogs, projects, workspaces } from '../../schema'
import { computeDocumentLogsWithMetadata } from '../../services/documentLogs'
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

  // TODO: remove in favor of computeDocumentLogsWithMetadata
  async getDocumentLogsWithMetadata({
    documentUuid,
    draft,
  }: {
    documentUuid: string
    draft?: Commit
  }): Promise<TypedResult<DocumentLogWithMetadata[], Error>> {
    return computeDocumentLogsWithMetadata(
      {
        workspaceId: this.workspaceId,
        documentUuid,
        draft,
      },
      this.db,
    )
  }
}
