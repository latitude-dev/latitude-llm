import { and, desc, eq, getTableColumns, isNull, sql } from 'drizzle-orm'
import { EvaluationV2 } from '../browser'
import { Result } from '../lib'
import { evaluationVersions } from '../schema'
import Repository from './repositoryV2'

const tt = {
  ...getTableColumns(evaluationVersions),
  uuid: sql<string>`${evaluationVersions.evaluationUuid}`.as('uuid'),
  versionId: sql<number>`${evaluationVersions.id}::integer`.as('versionId'),
}

export class EvaluationsV2Repository extends Repository<EvaluationV2> {
  get scopeFilter() {
    return and(
      eq(evaluationVersions.workspaceId, this.workspaceId),
      isNull(evaluationVersions.deletedAt),
    )
  }

  get scope() {
    return this.db
      .select(tt)
      .from(evaluationVersions)
      .where(this.scopeFilter)
      .orderBy(desc(evaluationVersions.createdAt))
      .$dynamic()
  }

  async listByDocumentVersion({
    commitId,
    documentUuid,
  }: {
    commitId: number
    documentUuid: string
  }) {
    const result = await this.scope.where(
      and(
        this.scopeFilter,
        eq(evaluationVersions.commitId, commitId),
        eq(evaluationVersions.documentUuid, documentUuid),
      ),
    )

    return Result.ok<EvaluationV2[]>(result)
  }
}
