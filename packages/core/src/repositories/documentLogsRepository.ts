import { NotFoundError, Result } from '$core/lib'
import { commits, documentLogs, projects, workspaces } from '$core/schema'
import { eq, getTableColumns } from 'drizzle-orm'

import Repository from './repository'

export class DocumentLogsRepository extends Repository {
  get scope() {
    return this.db
      .select(getTableColumns(documentLogs))
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
      return Result.error(new NotFoundError('ProviderLog not found'))
    }

    return Result.ok(result[0]!)
  }
}
