import { Commit, DocumentLog } from '$core/browser'
import { NotFoundError, Result, TypedResult } from '$core/lib'
import {
  commits,
  documentLogs,
  projects,
  providerLogs,
  workspaces,
} from '$core/schema'
import { and, desc, eq, getTableColumns, isNotNull, or, sum } from 'drizzle-orm'

import Repository from '../repository'

export type DocumentLogWithMetadata = DocumentLog & {
  commit: Commit
  tokens: number | null
  cost: number | null
}

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

  async getDocumentLogsWithMetadata(
    { documentUuid, draft }: { documentUuid: string; draft?: Commit },
    tx = this.db,
  ): Promise<TypedResult<DocumentLogWithMetadata[], NotFoundError>> {
    const aggregatedFieldsSubQuery = tx
      .select({
        id: this.scope.id,
        tokens: sum(providerLogs.tokens).mapWith(Number).as('tokens'),
        cost: sum(providerLogs.cost).mapWith(Number).as('cost'),
      })
      .from(this.scope)
      .innerJoin(
        providerLogs,
        eq(providerLogs.documentLogUuid, this.scope.uuid),
      )
      .groupBy(this.scope.id)
      .as('aggregatedFieldsSubQuery')

    const commitFilter = draft
      ? or(isNotNull(commits.mergedAt), eq(commits.id, draft.id))
      : isNotNull(commits.mergedAt)

    const result = await tx
      .select({
        ...this.scope._.selectedFields,
        commit: commits,
        tokens: aggregatedFieldsSubQuery.tokens,
        cost: aggregatedFieldsSubQuery.cost,
      })
      .from(this.scope)
      .innerJoin(commits, eq(commits.id, this.scope.commitId))
      .innerJoin(
        aggregatedFieldsSubQuery,
        eq(aggregatedFieldsSubQuery.id, this.scope.id),
      )
      .where(and(eq(this.scope.documentUuid, documentUuid), commitFilter))
      .orderBy(desc(this.scope.createdAt))

    return Result.ok(result)
  }
}
