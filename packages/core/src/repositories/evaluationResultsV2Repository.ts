import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  gte,
  inArray,
  isNull,
  sql,
} from 'drizzle-orm'
import {
  EvaluationResultsV2Search,
  EvaluationResultV2,
  ResultWithEvaluationV2,
} from '../browser'
import { calculateOffset, Result } from '../lib'
import {
  commits,
  evaluationResultsV2,
  evaluationVersions,
  providerLogs,
} from '../schema'
import { EvaluationsV2Repository } from './evaluationsV2Repository'
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
      .orderBy(
        desc(evaluationResultsV2.createdAt),
        desc(evaluationResultsV2.id),
      )
      .$dynamic()
  }

  listByEvaluationFilter({
    evaluationUuid,
    params: { filters },
  }: {
    evaluationUuid: string
    params: EvaluationResultsV2Search
  }) {
    const filter = [
      this.scopeFilter,
      isNull(commits.deletedAt),
      eq(evaluationResultsV2.evaluationUuid, evaluationUuid),
    ]

    if (filters?.commitIds?.length) {
      filter.push(inArray(evaluationResultsV2.commitId, filters.commitIds))
    }

    return and(...filter)
  }

  listByEvaluationQuery({
    evaluationUuid,
    params,
  }: {
    evaluationUuid: string
    params: EvaluationResultsV2Search
  }) {
    const filter = this.listByEvaluationFilter({ evaluationUuid, params })

    let query = this.db
      .select(tt)
      .from(evaluationResultsV2)
      .innerJoin(commits, eq(commits.id, evaluationResultsV2.commitId))
      .where(filter)
      .$dynamic()

    if (params.orders?.recency === 'asc') {
      query = query.orderBy(
        asc(evaluationResultsV2.createdAt),
        asc(evaluationResultsV2.id),
      )
    }

    if (params.orders?.recency === 'desc') {
      query = query.orderBy(
        desc(evaluationResultsV2.createdAt),
        desc(evaluationResultsV2.id),
      )
    }

    query = query
      .limit(params.pagination.pageSize)
      .offset(
        calculateOffset(params.pagination.page, params.pagination.pageSize),
      )

    return query
  }

  async listByEvaluation({
    evaluationUuid,
    params,
  }: {
    evaluationUuid: string
    params: EvaluationResultsV2Search
  }) {
    const results = await this.listByEvaluationQuery({ evaluationUuid, params })

    return Result.ok<EvaluationResultV2[]>(results as EvaluationResultV2[])
  }

  async countListByEvaluation({
    evaluationUuid,
    params,
  }: {
    evaluationUuid: string
    params: EvaluationResultsV2Search
  }) {
    const filter = this.listByEvaluationFilter({ evaluationUuid, params })

    const count = await this.db
      .select({
        count: sql`count(*)`.mapWith(Number).as('count'),
      })
      .from(evaluationResultsV2)
      .innerJoin(commits, eq(commits.id, evaluationResultsV2.commitId))
      .where(filter)
      .then((r) => r[0]?.count ?? 0)

    return Result.ok<number>(count)
  }

  async findListByEvaluationPosition({
    evaluationUuid,
    params,
  }: {
    evaluationUuid: string
    params: EvaluationResultsV2Search
  }) {
    const result = await this.db
      .select({
        id: evaluationResultsV2.id,
        createdAt: evaluationResultsV2.createdAt,
      })
      .from(evaluationResultsV2)
      .where(
        and(
          this.scopeFilter,
          eq(evaluationResultsV2.uuid, params.pagination.resultUuid!),
        ),
      )
      .then((r) => r[0])
    if (!result) return Result.ok(undefined)

    const filter = [this.listByEvaluationFilter({ evaluationUuid, params })]

    if (params.orders?.recency === 'asc') {
      filter.push(
        sql`(${evaluationResultsV2.createdAt}, ${evaluationResultsV2.id}) <= (${new Date(result.createdAt).toISOString()}, ${result.id})`,
      )
    }

    if (params.orders?.recency === 'desc') {
      filter.push(
        sql`(${evaluationResultsV2.createdAt}, ${evaluationResultsV2.id}) >= (${new Date(result.createdAt).toISOString()}, ${result.id})`,
      )
    }

    const position = await this.db
      .select({
        count: sql`count(*)`.mapWith(Number).as('count'),
      })
      .from(evaluationResultsV2)
      .innerJoin(commits, eq(commits.id, evaluationResultsV2.commitId))
      .where(and(...filter))
      .then((r) => r[0]?.count)
    if (position === undefined) return Result.ok(undefined)

    const page = Math.ceil(position / params.pagination.pageSize)

    return Result.ok<number>(page)
  }

  async listByDocumentLogs({
    projectId,
    documentUuid,
    documentLogUuids,
  }: {
    projectId?: number
    commitUuid: string
    documentUuid: string
    documentLogUuids: string[]
  }) {
    documentLogUuids = [...new Set(documentLogUuids)].filter(Boolean)
    if (!documentLogUuids.length) {
      return Result.ok<Record<string, ResultWithEvaluationV2[]>>({})
    }

    const results = await this.db
      .select({
        ...tt,
        commitUuid: commits.uuid,
        documentLogUuid: providerLogs.documentLogUuid,
      })
      .from(evaluationResultsV2)
      .leftJoin(
        evaluationVersions,
        and(
          eq(evaluationVersions.commitId, evaluationResultsV2.commitId),
          eq(
            evaluationVersions.evaluationUuid,
            evaluationResultsV2.evaluationUuid,
          ),
        ),
      )
      .innerJoin(commits, eq(commits.id, evaluationResultsV2.commitId))
      .innerJoin(
        providerLogs,
        eq(providerLogs.id, evaluationResultsV2.evaluatedLogId),
      )
      .where(
        and(
          this.scopeFilter,
          isNull(evaluationVersions.deletedAt),
          isNull(commits.deletedAt),
          inArray(providerLogs.documentLogUuid, documentLogUuids),
        ),
      )
      .orderBy(
        desc(evaluationResultsV2.createdAt),
        desc(evaluationResultsV2.id),
      )

    const evaluationsRepository = new EvaluationsV2Repository(
      this.workspaceId,
      this.db,
    )
    const commitUuids = [...new Set(results.map((r) => r.commitUuid))]
    const evaluationsByCommit = Object.fromEntries(
      await Promise.all(
        commitUuids.map(
          async (commitUuid) =>
            [
              commitUuid,
              await evaluationsRepository
                .listAtCommitByDocument({
                  projectId: projectId,
                  commitUuid: commitUuid,
                  documentUuid: documentUuid,
                })
                .then((r) => r.unwrap()),
            ] as const,
        ),
      ),
    )

    const resultsByDocumentLog = results.reduce<
      Record<string, ResultWithEvaluationV2[]>
    >(
      (acc, result) => ({
        ...acc,
        [result.documentLogUuid!]: [
          ...(acc[result.documentLogUuid!] ?? []),
          {
            result: result,
            evaluation: evaluationsByCommit[result.commitUuid]!.find(
              (e) => e.uuid === result.evaluationUuid,
            )!,
          } as ResultWithEvaluationV2,
        ],
      }),
      {},
    )

    return Result.ok<Record<string, ResultWithEvaluationV2[]>>(
      resultsByDocumentLog,
    )
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
