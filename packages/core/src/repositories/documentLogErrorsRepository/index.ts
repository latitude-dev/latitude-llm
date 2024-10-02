import { and, eq, getTableColumns } from 'drizzle-orm'

import { ErrorableEntity, RunError } from '../../browser'
import {
  commits,
  documentLogs,
  projects,
  runErrors,
  workspaces,
} from '../../schema'
import Repository from '../repository'

const tt = getTableColumns(runErrors)

export class DocumentLogErrorsRepository extends Repository<
  typeof tt,
  RunError
> {
  get scope() {
    return this.db
      .select(tt)
      .from(runErrors)
      .innerJoin(commits, eq(commits.id, documentLogs.commitId))
      .innerJoin(projects, eq(projects.id, commits.projectId))
      .innerJoin(workspaces, eq(workspaces.id, projects.workspaceId))
      .innerJoin(
        runErrors,
        and(
          eq(runErrors.errorableId, documentLogs.id),
          eq(runErrors.errorableType, ErrorableEntity.DocumentLog),
        ),
      )
      .where(eq(workspaces.id, this.workspaceId))
      .as('documentLogsErrorsScope')
  }
}
