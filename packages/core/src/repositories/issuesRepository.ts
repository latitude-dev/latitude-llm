import { eq, getTableColumns } from 'drizzle-orm'
import { type Issue } from '../schema/models/types/Issue'
import { issues } from '../schema/models/issues'
import RepositoryLegacy from './repository'

const tt = getTableColumns(issues)

export class IssuesRepository extends RepositoryLegacy<typeof tt, Issue> {
  get scope() {
    return this.db
      .select(tt)
      .from(issues)
      .where(eq(issues.workspaceId, this.workspaceId))
      .as('issuesScope')
  }
}
