import { eq, getTableColumns } from 'drizzle-orm'
import { type Issue } from '../schema/models/types/Issue'
import { issues } from '../schema/models/issues'
import RepositoryLegacy from './repository'
import { Result } from '../lib/Result'
import { NotFoundError } from '../lib/errors'

const tt = getTableColumns(issues)

export class IssuesRepository extends RepositoryLegacy<typeof tt, Issue> {
  get scope() {
    return this.db
      .select(tt)
      .from(issues)
      .where(eq(issues.workspaceId, this.workspaceId))
      .as('issuesScope')
  }

  async findByProjectId(projectId: number) {
    const result = await this.db
      .select(tt)
      .from(issues)
      .where(eq(issues.projectId, projectId))

    return Result.ok(result)
  }

  async findByDocumentUuid(documentUuid: string) {
    const result = await this.db
      .select(tt)
      .from(issues)
      .where(eq(issues.documentUuid, documentUuid))
      .limit(1)

    if (!result[0]) {
      return Result.error(new NotFoundError('Issue not found'))
    }

    return Result.ok(result[0]!)
  }

  async findByCommitId(commitId: number) {
    const result = await this.db
      .select(tt)
      .from(issues)
      .where(eq(issues.commitId, commitId))

    return Result.ok(result)
  }
}
