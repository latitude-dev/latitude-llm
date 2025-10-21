import {
  isAfter,
  isBefore,
  isToday,
  parseJSON,
  startOfDay,
  subDays,
} from 'date-fns'
import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  sql,
} from 'drizzle-orm'
import {
  EVALUATION_RESULT_RECENCY_DAYS,
  EvaluationResultV2,
  EvaluationType,
  MAX_EVALUATION_RESULTS_PER_DOCUMENT_SUGGESTION,
} from '../constants'
import { EvaluationResultsV2Search } from '../helpers'
import { NotFoundError } from '../lib/errors'
import { calculateOffset } from '../lib/pagination/index'
import { Result } from '../lib/Result'
import { commits } from '../schema/models/commits'
import { datasetRows } from '../schema/models/datasetRows'
import { datasets } from '../schema/models/datasets'
import { evaluationResultsV2 } from '../schema/models/evaluationResultsV2'
import { providerLogs } from '../schema/models/providerLogs'
import { spans } from '../schema/models/spans'
import {
  EvaluationResultV2WithDetails,
  EvaluationV2Stats,
  ResultWithEvaluationV2,
} from '../schema/types'
import serializeProviderLog from '../services/providerLogs/serialize'
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

  async findByUuid(uuid: string) {
    const result = await this.scope
      .where(and(this.scopeFilter, eq(evaluationResultsV2.uuid, uuid)))
      .limit(1)
      .then((r) => r[0])

    if (!result) {
      return Result.error(
        new NotFoundError(
          `Record with uuid ${uuid} not found in ${this.scope._.tableName}`,
        ),
      )
    }

    return Result.ok<EvaluationResultV2>(result as EvaluationResultV2)
  }

  async findManyByUuid(uuids: string[]) {
    const results = await this.scope
      .where(and(this.scopeFilter, inArray(evaluationResultsV2.uuid, uuids)))
      .limit(uuids.length)

    return Result.ok<EvaluationResultV2[]>(results as EvaluationResultV2[])
  }

  async findByEvaluatedLogAndEvaluation({
    evaluatedLogId,
    evaluationUuid,
  }: {
    evaluatedLogId: number
    evaluationUuid: string
  }) {
    const result = await this.scope
      .where(
        and(
          this.scopeFilter,
          eq(evaluationResultsV2.evaluatedLogId, evaluatedLogId),
          eq(evaluationResultsV2.evaluationUuid, evaluationUuid),
        ),
      )
      .limit(1)
      .then((r) => r[0])

    if (!result) {
      return Result.error(
        new NotFoundError(
          `Record with evaluatedLogId ${evaluatedLogId} and evaluationUuid ${evaluationUuid} not found in ${this.scope._.tableName}`,
        ),
      )
    }

    return Result.ok<EvaluationResultV2>(result as EvaluationResultV2)
  }

  async findByEvaluatedSpanAndEvaluation({
    evaluatedSpanId,
    evaluatedTraceId,
    evaluationUuid,
  }: {
    evaluatedSpanId: string
    evaluatedTraceId: string
    evaluationUuid: string
  }) {
    const result = await this.scope
      .where(
        and(
          this.scopeFilter,
          eq(evaluationResultsV2.evaluatedSpanId, evaluatedSpanId),
          eq(evaluationResultsV2.evaluatedTraceId, evaluatedTraceId),
          eq(evaluationResultsV2.evaluationUuid, evaluationUuid),
        ),
      )
      .limit(1)
      .then((r) => r[0])

    if (!result) {
      return Result.error(
        new NotFoundError(
          `Record with evaluatedSpanId ${evaluatedSpanId}, evaluatedTraceId ${evaluatedTraceId} and evaluationUuid ${evaluationUuid} not found in ${this.scope._.tableName}`,
        ),
      )
    }

    return Result.ok<EvaluationResultV2>(result as EvaluationResultV2)
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

    if (filters?.commitIds !== undefined) {
      if (filters.commitIds.length > 0) {
        filter.push(inArray(evaluationResultsV2.commitId, filters.commitIds))
      } else filter.push(eq(sql`TRUE`, sql`FALSE`))
    }

    if (filters?.experimentIds !== undefined) {
      if (filters.experimentIds.length > 0) {
        filter.push(
          inArray(evaluationResultsV2.experimentId, filters.experimentIds),
        )
      } else filter.push(isNull(evaluationResultsV2.experimentId))
    }

    if (filters?.errored !== undefined) {
      if (filters.errored) filter.push(isNotNull(evaluationResultsV2.error))
      else filter.push(isNull(evaluationResultsV2.error))
    }

    if (filters?.createdAt?.from) {
      filter.push(gte(evaluationResultsV2.createdAt, filters.createdAt.from))
    }

    if (filters?.createdAt?.to) {
      filter.push(lte(evaluationResultsV2.createdAt, filters.createdAt.to))
    }

    return and(...filter)
  }

  async listByEvaluation({
    evaluationUuid,
    params,
  }: {
    evaluationUuid: string
    params: EvaluationResultsV2Search
  }) {
    const filter = this.listByEvaluationFilter({ evaluationUuid, params })

    let query = this.db
      .select({
        ...tt,
        commit: commits,
        dataset: datasets,
        evaluatedRow: datasetRows,
        evaluatedLog: providerLogs,
        evaluatedSpan: spans,
      })
      .from(evaluationResultsV2)
      .innerJoin(commits, eq(commits.id, evaluationResultsV2.commitId))
      .leftJoin(datasets, eq(datasets.id, evaluationResultsV2.datasetId))
      .leftJoin(
        datasetRows,
        eq(datasetRows.id, evaluationResultsV2.evaluatedRowId),
      )
      .leftJoin(
        providerLogs,
        eq(providerLogs.id, evaluationResultsV2.evaluatedLogId),
      )
      .leftJoin(
        spans,
        and(
          eq(spans.id, evaluationResultsV2.evaluatedSpanId),
          eq(spans.traceId, evaluationResultsV2.evaluatedTraceId),
        ),
      )
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

    const results = await query.then((results) =>
      results.map((result) => ({
        ...result,
        evaluatedLog: serializeProviderLog(result.evaluatedLog),
      })),
    )

    return Result.ok<EvaluationResultV2WithDetails[]>(
      results as EvaluationResultV2WithDetails[],
    )
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

  async statsByEvaluation({
    projectId,
    commitUuid,
    documentUuid,
    evaluationUuid,
    params,
  }: {
    projectId?: number
    commitUuid: string
    documentUuid: string
    evaluationUuid: string
    params: EvaluationResultsV2Search
  }) {
    const evaluationsRepository = new EvaluationsV2Repository(
      this.workspaceId,
      this.db,
    )
    const evaluation = await evaluationsRepository
      .getAtCommitByDocument({
        projectId: projectId,
        commitUuid: commitUuid,
        documentUuid: documentUuid,
        evaluationUuid: evaluationUuid,
      })
      .then((r) => r.unwrap())

    const now = new Date()

    const stats = {
      totalResults: sql`count(*)`.mapWith(Number).as('total_results'),
      averageScore: sql`avg(${evaluationResultsV2.score})`
        .mapWith(Number)
        .as('average_score'),
      totalTokens:
        evaluation.type === EvaluationType.Llm
          ? sql`sum((${evaluationResultsV2.metadata}->>'tokens')::bigint)`
              .mapWith(Number)
              .as('total_tokens')
          : sql`0`.mapWith(Number),
      totalCost:
        evaluation.type === EvaluationType.Llm
          ? sql`sum((${evaluationResultsV2.metadata}->>'cost')::bigint)`
              .mapWith(Number)
              .as('total_cost')
          : sql`0`.mapWith(Number),
    }

    const filter = and(
      this.listByEvaluationFilter({ evaluationUuid, params }),
      isNull(evaluationResultsV2.error),
    )

    const totalStats = await this.db
      .select(stats)
      .from(evaluationResultsV2)
      .innerJoin(commits, eq(commits.id, evaluationResultsV2.commitId))
      .where(filter)
      .then((r) => r[0])

    if (!totalStats || totalStats.totalResults === 0) return Result.nil()

    const [dailyStats, versionStats] = await Promise.all([
      (async () => {
        const dailyStats = await this.db
          .select({
            date: sql`DATE_TRUNC('day', ${evaluationResultsV2.createdAt})`
              .mapWith(parseJSON)
              .as('date'),
            ...stats,
          })
          .from(evaluationResultsV2)
          .innerJoin(commits, eq(commits.id, evaluationResultsV2.commitId))
          .where(filter)
          .groupBy(sql`DATE_TRUNC('day', ${evaluationResultsV2.createdAt})`)
          .orderBy(
            asc(sql`DATE_TRUNC('day', ${evaluationResultsV2.createdAt})`),
          )

        // Note: average score is being computed as a running average
        let runningResults = 0
        let runningScore = 0
        for (let i = 0; i < dailyStats.length; i++) {
          runningResults += dailyStats[i]!.totalResults
          runningScore +=
            dailyStats[i]!.averageScore * dailyStats[i]!.totalResults
          dailyStats[i]!.averageScore = runningScore / runningResults
        }

        // Note: extending the running average to today when applies
        if (
          (!dailyStats.at(-1)?.date || !isToday(dailyStats.at(-1)!.date)) &&
          (!params.filters?.createdAt?.from ||
            isBefore(params.filters.createdAt.from, now)) &&
          (!params.filters?.createdAt?.to ||
            isAfter(params.filters.createdAt.to, now))
        ) {
          dailyStats.push({
            date: startOfDay(now),
            totalResults: 0,
            averageScore: runningScore / runningResults,
            totalTokens: 0,
            totalCost: 0,
          })
        }

        return dailyStats
      })(),
      (async () => {
        const versionStats = await this.db
          .select({
            version: commits,
            ...stats,
          })
          .from(evaluationResultsV2)
          .innerJoin(commits, eq(commits.id, evaluationResultsV2.commitId))
          .where(filter)
          .groupBy(commits.id)
          .orderBy(asc(stats.totalResults))

        return versionStats
      })(),
    ])

    return Result.ok<EvaluationV2Stats>({
      ...totalStats,
      dailyOverview: dailyStats,
      versionOverview: versionStats,
    })
  }

  async listByDocumentLogs({
    projectId,
    documentUuid,
    documentLogUuids,
  }: {
    projectId?: number
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
      .innerJoin(commits, eq(commits.id, evaluationResultsV2.commitId))
      .innerJoin(
        providerLogs,
        eq(providerLogs.id, evaluationResultsV2.evaluatedLogId),
      )
      .where(
        and(
          this.scopeFilter,
          isNull(commits.deletedAt),
          isNotNull(providerLogs.documentLogUuid),
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

    const resultsByDocumentLog: Record<string, ResultWithEvaluationV2[]> = {}
    for (const result of results) {
      const evaluation = evaluationsByCommit[result.commitUuid]!.find(
        (e) => e.uuid === result.evaluationUuid,
      )
      if (!evaluation) continue

      resultsByDocumentLog[result.documentLogUuid!] = [
        ...(resultsByDocumentLog[result.documentLogUuid!] ?? []),
        { result, evaluation } as ResultWithEvaluationV2,
      ]
    }

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

  async selectForDocumentSuggestion({
    commitId,
    evaluationUuid,
  }: {
    commitId: number
    evaluationUuid: string
  }) {
    const results = await this.db
      .select(tt)
      .from(evaluationResultsV2)
      .where(
        and(
          this.scopeFilter,
          eq(evaluationResultsV2.commitId, commitId),
          eq(evaluationResultsV2.evaluationUuid, evaluationUuid),
          sql`${evaluationResultsV2.usedForSuggestion} IS NOT TRUE`,
          isNull(evaluationResultsV2.error),
          sql`${evaluationResultsV2.hasPassed} IS NOT TRUE`,
          gte(
            evaluationResultsV2.createdAt,
            subDays(new Date(), EVALUATION_RESULT_RECENCY_DAYS),
          ),
        ),
      )
      .orderBy(
        asc(evaluationResultsV2.normalizedScore),
        desc(evaluationResultsV2.createdAt),
        desc(evaluationResultsV2.id),
      )
      .limit(MAX_EVALUATION_RESULTS_PER_DOCUMENT_SUGGESTION)

    return Result.ok<EvaluationResultV2[]>(results as EvaluationResultV2[])
  }
}
