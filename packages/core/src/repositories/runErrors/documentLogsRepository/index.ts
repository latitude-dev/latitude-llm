import { and, eq, getTableColumns } from 'drizzle-orm'

import { Commit, DocumentLog, ErrorableEntity } from '../../../browser'
import {
  commits,
  documentLogs,
  projects,
  runErrors,
  workspaces,
} from '../../../schema'
import Repository from '../../repository'
import { ERROR_SELECT } from '../evaluationResultsRepository'

export type DocumentLogWithMetadata = DocumentLog & {
  commit: Commit
  tokens: number | null
  duration: number | null
  costInMillicents: number | null
}

const tt = {
  ...getTableColumns(documentLogs),
  error: ERROR_SELECT,
}
type DocumentLogWithError = typeof tt

export class DocumentLogsWithErrorsRepository extends Repository<
  typeof tt,
  DocumentLogWithError
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
          eq(runErrors.errorableId, documentLogs.id),
          eq(runErrors.errorableType, ErrorableEntity.DocumentLog),
        ),
      )
      .where(eq(workspaces.id, this.workspaceId))
      .as('documentLogsWithErrorsScope')
  }
}
