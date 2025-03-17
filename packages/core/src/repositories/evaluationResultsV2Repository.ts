import {
  and,
  count,
  desc,
  eq,
  getTableColumns,
  gte,
  inArray,
  isNull,
} from 'drizzle-orm'
import { EvaluationResultV2 } from '../browser'
import { Result } from '../lib'
import {
  evaluationResultsV2,
  evaluationVersions,
  providerLogs,
} from '../schema'
import Repository from './repositoryV2'

const tt = getTableColumns(evaluationResultsV2)

export class EvaluationResultsV2Repository extends Repository<EvaluationResultV2> {
  get scopeFilter() {
    return eq(evaluationResultsV2.workspaceId, this.workspaceId)
  }

  get scope() {
    return this.db
      .select(tt)
      .from(evaluationResultsV2)
      .where(this.scopeFilter)
      .orderBy(desc(evaluationResultsV2.createdAt))
      .$dynamic()
  }

  async listByEvaluation({ evaluationUuid }: { evaluationUuid: string }) {
    const results = await this.scope.where(
      and(
        this.scopeFilter,
        eq(evaluationResultsV2.evaluationUuid, evaluationUuid),
      ),
    )

    return Result.ok<EvaluationResultV2[]>(results as EvaluationResultV2[])
  }

  async listByDocumentLogs({
    documentLogUuids,
  }: {
    documentLogUuids: string[]
  }) {
    documentLogUuids = [...new Set(documentLogUuids)].filter(Boolean)
    if (!documentLogUuids.length) {
      return Result.ok<Record<string, EvaluationResultV2[]>>({})
    }

    const results = await this.db
      .select({
        ...tt,
        documentLogUuid: providerLogs.documentLogUuid,
      })
      .from(evaluationResultsV2)
      .innerJoin(
        evaluationVersions,
        eq(
          evaluationVersions.evaluationUuid,
          evaluationResultsV2.evaluationUuid,
        ),
      )
      .innerJoin(
        providerLogs,
        eq(providerLogs.id, evaluationResultsV2.evaluatedLogId),
      )
      .where(
        and(
          this.scopeFilter,
          isNull(evaluationVersions.deletedAt),
          inArray(providerLogs.documentLogUuid, documentLogUuids),
        ),
      )
      .orderBy(desc(evaluationResultsV2.createdAt))

    const resultsByDocumentLog = results.reduce<
      Record<string, EvaluationResultV2[]>
    >(
      (acc, result) => ({
        ...acc,
        [result.documentLogUuid!]: [
          ...(acc[result.documentLogUuid!] ?? []),
          result as EvaluationResultV2,
        ],
      }),
      {},
    )

    return Result.ok<Record<string, EvaluationResultV2[]>>(resultsByDocumentLog)
  }

  async countSinceDate(since: Date) {
    const result = await this.db
      .select({ count: count() })
      .from(evaluationResultsV2)
      .where(
        and(
          this.scopeFilter,
          isNull(evaluationResultsV2.error),
          gte(evaluationResultsV2.createdAt, since),
        ),
      )
      .then((r) => r[0]!)

    return Result.ok<number>(result.count)
  }
}
