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
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  sql,
} from 'drizzle-orm'
import {
  EvaluationResultV2,
  EvaluationType,
  ISSUE_GENERATION_MAX_RESULTS,
  ISSUE_GENERATION_RECENCY_DAYS,
  ISSUE_GENERATION_RECENCY_RATIO,
  LogSources,
  Span,
} from '../constants'
import { EvaluationResultsV2Search } from '../helpers'
import { calculateOffset } from '../lib/pagination/index'
import { Result } from '../lib/Result'
import { commits } from '../schema/models/commits'
import { datasetRows } from '../schema/models/datasetRows'
import { datasets } from '../schema/models/datasets'
import { evaluationResultsV2 } from '../schema/models/evaluationResultsV2'
import { issueEvaluationResults } from '../schema/models/issueEvaluationResults'
import { Commit } from '../schema/models/types/Commit'
import { Issue } from '../schema/models/types/Issue'
import { Workspace } from '../schema/models/types/Workspace'
import {
  EvaluationResultV2WithDetails,
  EvaluationV2Stats,
  ResultWithEvaluationV2,
} from '../schema/types'
import { CommitsRepository } from './commitsRepository'
import { EvaluationsV2Repository } from './evaluationsV2Repository'
import { findLastActiveAssignedIssue } from '../queries/issueEvaluationResults/findLastActiveAssignedIssue'
import Repository from './repositoryV2'
import { SpansRepository } from './spansRepository'
import { spans } from '../schema/models/spans'
import { Database, database } from '../client'
import { isClickHouseEvaluationResultsReadEnabled } from '../services/workspaceFeatures/isClickHouseEvaluationResultsReadEnabled'
import { captureException } from '../utils/datadogCapture'
import { listEvaluationResultsByEvaluation } from '../queries/clickhouse/evaluationResultsV2/listByEvaluation'
import { countEvaluationResultsByEvaluation } from '../queries/clickhouse/evaluationResultsV2/countByEvaluation'
import { listEvaluationResultsBySessionId } from '../queries/clickhouse/evaluationResultsV2/listBySessionId'
import { listEvaluationResultsBySpanAndEvaluations } from '../queries/clickhouse/evaluationResultsV2/listBySpanAndEvaluations'
import { findEvaluationResultBySpanAndEvaluation } from '../queries/clickhouse/evaluationResultsV2/findBySpanAndEvaluation'
import { listEvaluationResultsBySpans } from '../queries/clickhouse/evaluationResultsV2/listBySpans'
import { listEvaluationResultsByIssueIds } from '../queries/clickhouse/evaluationResultsV2/listByIssueIds'
import { countEvaluationResultsSinceDate } from '../queries/clickhouse/evaluationResultsV2/countSinceDate'
import { selectEvaluationResultsForIssueGeneration } from '../queries/clickhouse/evaluationResultsV2/selectForIssueGeneration'
import {
  getEvaluationStatsByEvaluation,
  EvaluationDailyStatsRow,
  EvaluationVersionStatsRow,
} from '../queries/clickhouse/evaluationResultsV2/getStatsByEvaluation'
import { findEvaluationResultListPosition } from '../queries/clickhouse/evaluationResultsV2/findListByEvaluationPosition'
import { listEvaluationResultsBySpanAndTraceIds } from '../queries/clickhouse/evaluationResultsV2/listBySpanAndTraceIds'
import {
  listPaginatedHITLResultsByIssue,
  HITLResultRow,
} from '../queries/clickhouse/evaluationResultsV2/listPaginatedHITLResultsByIssue'
import {
  listPaginatedHITLResultsByDocument,
  HITLResultWithEvaluationRow,
} from '../queries/clickhouse/evaluationResultsV2/listPaginatedHITLResultsByDocument'

const tt = getTableColumns(evaluationResultsV2)

export class EvaluationResultsV2Repository extends Repository<EvaluationResultV2> {
  private clickHouseOverride: boolean | undefined

  constructor(
    workspaceId: number,
    db: Database = database,
    options?: { useClickHouse?: boolean },
  ) {
    super(workspaceId, db)
    this.clickHouseOverride = options?.useClickHouse
  }

  private async shouldUseClickHouse(): Promise<boolean> {
    if (this.clickHouseOverride !== undefined) return this.clickHouseOverride

    try {
      this.clickHouseOverride = await isClickHouseEvaluationResultsReadEnabled(
        this.workspaceId,
        this.db,
      )
    } catch (error) {
      captureException(error as Error)
      this.clickHouseOverride = false
    }

    return this.clickHouseOverride
  }

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

  async listBySpanAndEvaluations({
    projectId,
    spans,
    evaluationUuids,
    commitHistoryUuids,
  }: {
    projectId: number
    spans: { id: string; traceId: string }[]
    evaluationUuids: string[]
    commitHistoryUuids: string[]
  }) {
    if (!spans.length || !evaluationUuids.length) return []

    const useClickHouse = await this.shouldUseClickHouse()
    if (useClickHouse) {
      return await listEvaluationResultsBySpanAndEvaluations(
        {
          workspaceId: this.workspaceId,
          projectId,
          spans,
          evaluationUuids,
        },
        this.db,
      )
    }

    const spanIds = spans.map((s) => s.id)
    const traceIds = spans.map((s) => s.traceId)

    const commitHistoryIds = await this.db
      .select({ id: commits.id })
      .from(commits)
      .where(inArray(commits.uuid, commitHistoryUuids))
      .then((rows) => rows.map((r) => r.id))

    const results = await this.db
      .select(tt)
      .from(evaluationResultsV2)
      .where(
        and(
          this.scopeFilter,
          inArray(evaluationResultsV2.evaluatedSpanId, spanIds),
          inArray(evaluationResultsV2.evaluatedTraceId, traceIds),
          inArray(evaluationResultsV2.evaluationUuid, evaluationUuids),
          inArray(evaluationResultsV2.commitId, commitHistoryIds),
        ),
      )

    // TODO(clickhouse): fix
    return results
  }

  async findByEvaluatedSpanAndEvaluation({
    projectId,
    evaluatedSpanId,
    evaluatedTraceId,
    evaluationUuid,
  }: {
    projectId: number
    evaluatedSpanId: string
    evaluatedTraceId: string
    evaluationUuid: string
  }) {
    const useClickHouse = await this.shouldUseClickHouse()

    if (useClickHouse) {
      return await findEvaluationResultBySpanAndEvaluation(
        {
          workspaceId: this.workspaceId,
          projectId,
          evaluatedSpanId,
          evaluatedTraceId,
          evaluationUuid,
        },
        this.db,
      )
    }

    return (await this.scope
      .where(
        and(
          this.scopeFilter,
          eq(evaluationResultsV2.evaluatedSpanId, evaluatedSpanId),
          eq(evaluationResultsV2.evaluatedTraceId, evaluatedTraceId),
          eq(evaluationResultsV2.evaluationUuid, evaluationUuid),
        ),
      )
      .limit(1)
      .then((r) => r[0])) as EvaluationResultV2 | undefined
  }

  private listByEvaluationFilter({
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

    if (filters?.commitUuids !== undefined) {
      if (filters.commitUuids.length > 0) {
        filter.push(
          inArray(
            evaluationResultsV2.commitId,
            this.db
              .select({ id: commits.id })
              .from(commits)
              .where(inArray(commits.uuid, filters.commitUuids)),
          ),
        )
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
    projectId,
    evaluationUuid,
    params,
  }: {
    projectId: number
    evaluationUuid: string
    params: EvaluationResultsV2Search
  }) {
    const useClickHouse = await this.shouldUseClickHouse()
    if (useClickHouse) {
      const chResults = await listEvaluationResultsByEvaluation(
        {
          workspaceId: this.workspaceId,
          projectId,
          evaluationUuid,
          commitUuids: params.filters?.commitUuids,
          experimentIds: params.filters?.experimentIds,
          errored: params.filters?.errored,
          createdAtFrom: params.filters?.createdAt?.from,
          createdAtTo: params.filters?.createdAt?.to,
          limit: params.pagination.pageSize,
          offset: calculateOffset(
            params.pagination.page,
            params.pagination.pageSize,
          ),
          orderBy: params.orders?.recency === 'asc' ? 'asc' : 'desc',
        },
        this.db,
      )

      return Result.ok(chResults)
    }

    const filter = this.listByEvaluationFilter({ evaluationUuid, params })

    let query = this.db
      .select({
        ...tt,
        commit: commits,
        dataset: datasets,
        evaluatedRow: datasetRows,
      })
      .from(evaluationResultsV2)
      .innerJoin(commits, eq(commits.id, evaluationResultsV2.commitId))
      .leftJoin(datasets, eq(datasets.id, evaluationResultsV2.datasetId))
      .leftJoin(
        datasetRows,
        eq(datasetRows.id, evaluationResultsV2.evaluatedRowId),
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

    return Result.ok(await query)
  }

  async countListByEvaluation({
    projectId,
    evaluationUuid,
    params,
  }: {
    projectId: number
    evaluationUuid: string
    params: EvaluationResultsV2Search
  }) {
    const useClickHouse = await this.shouldUseClickHouse()
    if (useClickHouse) {
      const count = await countEvaluationResultsByEvaluation(
        {
          workspaceId: this.workspaceId,
          projectId,
          evaluationUuid,
          commitUuids: params.filters?.commitUuids,
          experimentIds: params.filters?.experimentIds,
          errored: params.filters?.errored,
          createdAtFrom: params.filters?.createdAt?.from,
          createdAtTo: params.filters?.createdAt?.to,
        },
        this.db,
      )

      return Result.ok(count)
    }

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
    projectId,
    evaluationUuid,
    params,
  }: {
    projectId: number
    evaluationUuid: string
    params: EvaluationResultsV2Search
  }) {
    const useClickHouse = await this.shouldUseClickHouse()

    if (useClickHouse) {
      const resultId = params.pagination.resultId
      if (!resultId) return Result.ok(undefined)

      const pgTargetResult = await this.db
        .select({ id: evaluationResultsV2.id })
        .from(evaluationResultsV2)
        .where(and(this.scopeFilter, eq(evaluationResultsV2.id, resultId)))
        .limit(1)
        .then((r) => r[0])
      if (!pgTargetResult) return Result.ok(undefined)

      const page = await findEvaluationResultListPosition(
        {
          workspaceId: this.workspaceId,
          projectId,
          evaluationUuid,
          resultId: pgTargetResult.id,
          orderBy: params.orders?.recency === 'asc' ? 'asc' : 'desc',
          pageSize: params.pagination.pageSize,
          commitUuids: params.filters?.commitUuids,
          experimentIds: params.filters?.experimentIds,
          errored: params.filters?.errored,
          createdAtFrom: params.filters?.createdAt?.from,
          createdAtTo: params.filters?.createdAt?.to,
        },
        this.db,
      )

      return Result.ok(page)
    }

    const result = await this.db
      .select({
        id: evaluationResultsV2.id,
        createdAt: evaluationResultsV2.createdAt,
      })
      .from(evaluationResultsV2)
      .where(
        and(
          this.scopeFilter,
          eq(evaluationResultsV2.id, params.pagination.resultId!),
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
    const useClickHouse = await this.shouldUseClickHouse()

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

    if (useClickHouse) {
      const now = new Date()

      const {
        totalStats,
        dailyStats: rawDailyStats,
        versionStats: rawVersionStats,
      } = await getEvaluationStatsByEvaluation(
        {
          workspaceId: this.workspaceId,
          evaluationUuid,
          isLlmEvaluation: evaluation.type === EvaluationType.Llm,
          commitUuids: params.filters?.commitUuids,
          experimentIds: params.filters?.experimentIds,
          errored: params.filters?.errored,
          createdAtFrom: params.filters?.createdAt?.from,
          createdAtTo: params.filters?.createdAt?.to,
        },
        this.db,
      )

      if (!totalStats || totalStats.total_results === 0) return Result.nil()

      const dailyStats = rawDailyStats.map((row: EvaluationDailyStatsRow) => ({
        date: new Date(row.date),
        totalResults: row.total_results,
        averageScore: row.average_score,
        totalTokens: row.total_tokens ?? 0,
        totalCost: row.total_cost ?? 0,
      }))

      let runningResults = 0
      let runningScore = 0
      for (let i = 0; i < dailyStats.length; i++) {
        runningResults += dailyStats[i]!.totalResults
        runningScore +=
          dailyStats[i]!.averageScore * dailyStats[i]!.totalResults
        dailyStats[i]!.averageScore = runningScore / runningResults
      }

      if (
        runningResults > 0 &&
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

      const commitUuids = [
        ...new Set(
          rawVersionStats.map((r: EvaluationVersionStatsRow) => r.commit_uuid),
        ),
      ]
      const commitsData = commitUuids.length
        ? await this.db
            .select()
            .from(commits)
            .where(inArray(commits.uuid, commitUuids))
        : []

      const commitMap = new Map(commitsData.map((c) => [c.uuid, c]))

      const versionStats: EvaluationV2Stats['versionOverview'] = []
      for (const row of rawVersionStats) {
        const version = commitMap.get(row.commit_uuid)
        if (!version) continue

        versionStats.push({
          version,
          totalResults: row.total_results,
          averageScore: row.average_score ?? 0,
          totalTokens: row.total_tokens ?? 0,
          totalCost: row.total_cost ?? 0,
        })
      }

      return Result.ok<EvaluationV2Stats>({
        totalResults: totalStats.total_results,
        averageScore: totalStats.average_score ?? 0,
        totalTokens: totalStats.total_tokens ?? 0,
        totalCost: totalStats.total_cost ?? 0,
        dailyOverview: dailyStats,
        versionOverview: versionStats,
      })
    }

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

  async listBySpans(spans: Span[]) {
    const useClickHouse = await this.shouldUseClickHouse()

    if (useClickHouse) {
      const results = await listEvaluationResultsBySpans(
        { workspaceId: this.workspaceId, spans },
        this.db,
      )
      return Result.ok(
        results as (EvaluationResultV2 & { commitUuid: string })[],
      )
    }

    const results = await this.db
      .select({
        ...tt,
        commitUuid: commits.uuid,
      })
      .from(evaluationResultsV2)
      .innerJoin(commits, eq(commits.id, evaluationResultsV2.commitId))
      .where(
        and(
          this.scopeFilter,
          isNull(commits.deletedAt),
          inArray(
            evaluationResultsV2.evaluatedSpanId,
            spans.map((s) => s.id),
          ),
          inArray(
            evaluationResultsV2.evaluatedTraceId,
            spans.map((s) => s.traceId),
          ),
        ),
      )
      .orderBy(
        desc(evaluationResultsV2.createdAt),
        desc(evaluationResultsV2.id),
      )

    return Result.ok(results)
  }

  async listByTraceIds(traceIds: string[]) {
    traceIds = [...new Set(traceIds)].filter(Boolean)
    if (!traceIds.length) {
      return Result.ok([])
    }

    const results = await this.db
      .select(tt)
      .from(evaluationResultsV2)
      .where(
        and(
          this.scopeFilter,
          inArray(evaluationResultsV2.evaluatedTraceId, traceIds),
        ),
      )
      .orderBy(
        desc(evaluationResultsV2.createdAt),
        desc(evaluationResultsV2.id),
      )

    if (results.length === 0) {
      return Result.ok([])
    }

    const commitIds = [...new Set(results.map((r) => r.commitId))]
    const commitsData = await this.db
      .select({ id: commits.id, uuid: commits.uuid })
      .from(commits)
      .where(and(inArray(commits.id, commitIds), isNull(commits.deletedAt)))

    const commitMap = new Map(commitsData.map((c) => [c.id, c.uuid]))

    const resultsWithCommit = results
      .filter((r) => commitMap.has(r.commitId))
      .map((r) => ({ ...r, commitUuid: commitMap.get(r.commitId)! }))

    return Result.ok(resultsWithCommit)
  }

  async listBySessionId(sessionId: string) {
    if (!sessionId) return Result.ok([])

    const chResults = await listEvaluationResultsBySessionId(
      { workspaceId: this.workspaceId, sessionId },
      this.db,
    )

    return Result.ok(chResults)
  }

  // Be careful using this with merged issues, as there will be multiple evaluation results for the same issue
  async listByIssueIds(issueIds: number[], commitHistoryIds: number[]) {
    const uniqueIssueIds = [...new Set(issueIds)].filter(Boolean)
    if (!uniqueIssueIds.length) {
      return []
    }

    const useClickHouse = await this.shouldUseClickHouse()

    if (useClickHouse) {
      const commitUuids = commitHistoryIds.length
        ? await this.db
            .select({ uuid: commits.uuid })
            .from(commits)
            .where(inArray(commits.id, commitHistoryIds))
            .then((rows) => rows.map((r) => r.uuid))
        : []

      if (!commitUuids.length) return []

      const rows = await listEvaluationResultsByIssueIds(
        {
          workspaceId: this.workspaceId,
          commitUuids,
          issueIds: uniqueIssueIds,
        },
        this.db,
      )

      return rows.map((row) => {
        const joinedIssueId = row.issueIds.find((id) =>
          uniqueIssueIds.includes(id),
        )
        return {
          ...row,
          joinedIssueId: joinedIssueId ?? uniqueIssueIds[0]!,
        }
      }) as (EvaluationResultV2 & { joinedIssueId: number })[]
    }

    const results = await this.db
      .select({
        ...tt,
        commitUuid: commits.uuid,
        joinedIssueId: issueEvaluationResults.issueId,
      })
      .from(evaluationResultsV2)
      .innerJoin(commits, eq(commits.id, evaluationResultsV2.commitId))
      .innerJoin(
        issueEvaluationResults,
        eq(issueEvaluationResults.evaluationResultId, evaluationResultsV2.id),
      )
      .where(
        and(
          this.scopeFilter,
          isNull(commits.deletedAt),
          inArray(issueEvaluationResults.issueId, uniqueIssueIds),
          inArray(evaluationResultsV2.commitId, commitHistoryIds),
        ),
      )
      .orderBy(
        desc(evaluationResultsV2.createdAt),
        desc(evaluationResultsV2.id),
      )

    return results
  }

  async listBySpanAndDocumentLogUuid({
    projectId,
    documentUuid,
    spanId,
    documentLogUuid,
  }: {
    projectId?: number
    documentUuid: string
    spanId: string
    documentLogUuid: string
  }) {
    const spansRepository = new SpansRepository(this.workspaceId, this.db)
    const traceIds =
      await spansRepository.listTraceIdsByLogUuid(documentLogUuid)

    if (traceIds.length === 0) {
      return Result.ok<ResultWithEvaluationV2[]>([])
    }

    const useClickHouse = await this.shouldUseClickHouse()

    if (useClickHouse) {
      const results = (await listEvaluationResultsBySpanAndTraceIds(
        { workspaceId: this.workspaceId, spanId, traceIds },
        this.db,
      )) as (EvaluationResultV2 & { commitUuid: string })[]

      const evaluationsByCommit = await this.getEvaluationsByCommit({
        projectId: projectId!,
        documentUuid,
        results,
      })

      const resultsWithEvaluations: ResultWithEvaluationV2[] = []
      for (const result of results) {
        const evaluation = evaluationsByCommit[result.commitUuid]!.find(
          (e) => e.uuid === result.evaluationUuid,
        )
        if (!evaluation) continue

        const activeAssignment = await findLastActiveAssignedIssue(
          {
            workspaceId: this.workspaceId,
            resultId: (result as EvaluationResultV2).id,
          },
          this.db,
        )

        const resultWithIssue = {
          ...result,
          issueId: activeAssignment?.issueId ?? null,
        }

        resultsWithEvaluations.push({
          result: resultWithIssue,
          evaluation,
        } as ResultWithEvaluationV2)
      }

      return Result.ok<ResultWithEvaluationV2[]>(resultsWithEvaluations)
    }

    let results = await this.db
      .select({
        ...tt,
        commitUuid: commits.uuid,
      })
      .from(evaluationResultsV2)
      .innerJoin(commits, eq(commits.id, evaluationResultsV2.commitId))
      .where(
        and(
          this.scopeFilter,
          isNull(commits.deletedAt),
          eq(evaluationResultsV2.evaluatedSpanId, spanId),
          inArray(evaluationResultsV2.evaluatedTraceId, traceIds),
        ),
      )
      .orderBy(
        desc(evaluationResultsV2.createdAt),
        desc(evaluationResultsV2.id),
      )

    results = results.map((r) => ({
      ...r,
      documentUuid,
    })) as EvaluationResultV2[]
    const evaluationsByCommit = await this.getEvaluationsByCommit({
      projectId: projectId!,
      documentUuid,
      results,
    })

    const resultsWithEvaluations: ResultWithEvaluationV2[] = []
    for (const result of results) {
      const evaluation = evaluationsByCommit[result.commitUuid]!.find(
        (e) => e.uuid === result.evaluationUuid,
      )
      if (!evaluation) continue

      const activeAssignment = await findLastActiveAssignedIssue(
        {
          workspaceId: this.workspaceId,
          resultId: result.id,
        },
        this.db,
      )

      const resultWithIssue = {
        ...result,
        issueId: activeAssignment?.issueId ?? null,
      }

      resultsWithEvaluations.push({
        result: resultWithIssue,
        evaluation,
      } as ResultWithEvaluationV2)
    }

    return Result.ok<ResultWithEvaluationV2[]>(resultsWithEvaluations)
  }

  async countSinceDate(since: Date) {
    const useClickHouse = await this.shouldUseClickHouse()

    if (useClickHouse) {
      const count = await countEvaluationResultsSinceDate(
        { workspaceId: this.workspaceId, since },
        this.db,
      )
      return Result.ok<number>(count)
    }

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

  async selectForIssueGeneration({ issueId }: { issueId: number }) {
    const useClickHouse = await this.shouldUseClickHouse()

    if (useClickHouse) {
      const mergedCommitUuids = await this.db
        .select({ uuid: commits.uuid })
        .from(commits)
        .where(isNotNull(commits.mergedAt))
        .then((rows) => rows.map((r) => r.uuid))

      if (!mergedCommitUuids.length) {
        return Result.ok<EvaluationResultV2[]>([])
      }

      const newerLimit = Math.ceil(
        ISSUE_GENERATION_MAX_RESULTS * ISSUE_GENERATION_RECENCY_RATIO,
      )

      const results = await selectEvaluationResultsForIssueGeneration(
        {
          workspaceId: this.workspaceId,
          issueId,
          mergedCommitUuids,
          recentDate: subDays(
            new Date(),
            ISSUE_GENERATION_RECENCY_DAYS,
          ).toISOString(),
          newerLimit,
          olderLimit: ISSUE_GENERATION_MAX_RESULTS - newerLimit,
        },
        this.db,
      )

      return Result.ok<EvaluationResultV2[]>(
        results.slice(0, ISSUE_GENERATION_MAX_RESULTS) as EvaluationResultV2[],
      )
    }

    const conditions = [
      this.scopeFilter,
      eq(issueEvaluationResults.issueId, issueId),
      isNotNull(commits.mergedAt),
      isNull(evaluationResultsV2.error),
      isNull(evaluationResultsV2.experimentId),
      sql`${evaluationResultsV2.hasPassed} IS NOT TRUE`,
    ]

    const newerLimit = Math.ceil(
      ISSUE_GENERATION_MAX_RESULTS * ISSUE_GENERATION_RECENCY_RATIO,
    )
    const newer = await this.db
      .select(tt)
      .from(evaluationResultsV2)
      .innerJoin(commits, eq(commits.id, evaluationResultsV2.commitId))
      .innerJoin(
        issueEvaluationResults,
        eq(issueEvaluationResults.evaluationResultId, evaluationResultsV2.id),
      )
      .where(
        and(
          ...conditions,
          gte(
            evaluationResultsV2.createdAt,
            subDays(new Date(), ISSUE_GENERATION_RECENCY_DAYS),
          ),
        ),
      )
      .orderBy(
        desc(evaluationResultsV2.createdAt),
        desc(evaluationResultsV2.id),
        asc(evaluationResultsV2.normalizedScore),
      )
      .limit(newerLimit)

    const olderLimit = ISSUE_GENERATION_MAX_RESULTS - newerLimit
    const older = await this.db
      .select(tt)
      .from(evaluationResultsV2)
      .innerJoin(
        issueEvaluationResults,
        eq(issueEvaluationResults.evaluationResultId, evaluationResultsV2.id),
      )
      .innerJoin(commits, eq(commits.id, evaluationResultsV2.commitId))
      .where(and(...conditions))
      .orderBy(
        asc(evaluationResultsV2.createdAt),
        asc(evaluationResultsV2.id),
        asc(evaluationResultsV2.normalizedScore),
      )
      .limit(olderLimit)

    let results = [...newer]
    for (const result of older) {
      if (newer.find((r) => r.id === result.id)) continue
      results.push(result)
    }
    results = results.slice(0, ISSUE_GENERATION_MAX_RESULTS)

    return Result.ok<EvaluationResultV2[]>(results)
  }

  async fetchPaginatedHITLResultsByIssue({
    workspace,
    commit,
    issue,
    page,
    pageSize,
    afterDate,
    orderDirection = 'asc',
  }: {
    workspace: Workspace
    commit: Commit
    issue: Issue
    page: number
    pageSize: number
    orderDirection?: 'asc' | 'desc'
    afterDate?: string
  }) {
    const commitsRepo = new CommitsRepository(workspace.id, this.db)
    const commitHistory = await commitsRepo.getCommitsHistory({ commit })
    const commitIds = commitHistory.map((c) => c.id)
    const commitUuids = commitHistory.map((c) => c.uuid)
    const limit = pageSize + 1
    const offset = calculateOffset(page, pageSize)

    const useClickHouse = await this.shouldUseClickHouse()

    if (useClickHouse) {
      const fetchLimit = limit * 2

      const allEvalResults = await listPaginatedHITLResultsByIssue(
        {
          workspaceId: workspace.id,
          issueId: issue.id,
          commitUuids,
          afterDate,
          orderDirection,
          fetchLimit,
          offset,
        },
        this.db,
      )

      const seenSpans = new Set<string>()
      const deduplicatedResults = allEvalResults.filter(
        (result: HITLResultRow) => {
          const spanKey = `${result.evaluated_span_id}:${result.evaluated_trace_id}`
          if (seenSpans.has(spanKey)) return false
          seenSpans.add(spanKey)
          return true
        },
      )

      const commitMap = new Map(commitHistory.map((c) => [c.uuid, c.id]))
      const mapped = deduplicatedResults
        .slice(0, pageSize + 1)
        .map((row: HITLResultRow) => ({
          id: row.id,
          evaluatedSpanId: row.evaluated_span_id,
          evaluatedTraceId: row.evaluated_trace_id,
          createdAt: new Date(row.created_at),
          commitId: commitMap.get(row.commit_uuid),
          type: EvaluationType.Human,
        }))
        .filter((r) => r.commitId !== undefined)

      const paginatedResults = mapped.slice(0, pageSize)
      const hasNextPage = mapped.length > pageSize
      const results = hasNextPage ? paginatedResults : mapped

      return {
        results: results as EvaluationResultV2[],
        hasNextPage,
      }
    }

    const whereConditions = [
      eq(issueEvaluationResults.workspaceId, workspace.id),
      eq(issueEvaluationResults.issueId, issue.id),
      eq(evaluationResultsV2.type, EvaluationType.Human),
      isNotNull(evaluationResultsV2.evaluatedSpanId),
      isNotNull(evaluationResultsV2.evaluatedTraceId),
      isNull(commits.deletedAt),
      inArray(evaluationResultsV2.commitId, commitIds),
    ]

    if (afterDate) {
      whereConditions.push(
        gt(evaluationResultsV2.createdAt, new Date(afterDate)),
      )
    }

    const orderDirectionFn = orderDirection === 'asc' ? asc : desc

    // Fetch more results to account for duplicates during deduplication. We
    // multiply by 2 to have a buffer.
    const fetchLimit = limit * 2
    const allEvalResults = await this.db
      .select({
        id: evaluationResultsV2.id,
        evaluatedSpanId: evaluationResultsV2.evaluatedSpanId,
        evaluatedTraceId: evaluationResultsV2.evaluatedTraceId,
        createdAt: evaluationResultsV2.createdAt,
      })
      .from(issueEvaluationResults)
      .innerJoin(
        evaluationResultsV2,
        eq(issueEvaluationResults.evaluationResultId, evaluationResultsV2.id),
      )
      .innerJoin(commits, eq(commits.id, evaluationResultsV2.commitId))
      .where(and(...whereConditions))
      .orderBy(
        orderDirectionFn(evaluationResultsV2.createdAt),
        orderDirectionFn(evaluationResultsV2.id),
      )
      .limit(fetchLimit)
      .offset(offset)

    // Deduplicate by span (keep first occurrence which is the latest due to ordering)
    const seenSpans = new Set<string>()
    const deduplicatedResults = allEvalResults.filter((result) => {
      const spanKey = `${result.evaluatedSpanId}:${result.evaluatedTraceId}`
      if (seenSpans.has(spanKey)) {
        return false
      }
      seenSpans.add(spanKey)
      return true
    })

    const paginatedResults = deduplicatedResults.slice(0, pageSize)
    const hasNextPage = deduplicatedResults.length > pageSize
    const results = hasNextPage ? paginatedResults : deduplicatedResults
    return { results, hasNextPage }
  }

  async fetchPaginatedHITLResultsByDocument({
    workspace,
    commit,
    documentUuid,
    excludeIssueId,
    page,
    pageSize,
    afterDate,
    orderDirection = 'asc',
  }: {
    workspace: Workspace
    commit: Commit
    documentUuid: string
    excludeIssueId: number
    page: number
    pageSize: number
    orderDirection?: 'asc' | 'desc'
    afterDate?: string
  }) {
    const commitsRepo = new CommitsRepository(workspace.id, this.db)
    const commitHistory = await commitsRepo.getCommitsHistory({ commit })
    const commitIds = commitHistory.map((c) => c.id)
    const commitUuids = commitHistory.map((c) => c.uuid)
    const limit = pageSize + 1
    const offset = calculateOffset(page, pageSize)

    const evaluationsRepo = new EvaluationsV2Repository(workspace.id, this.db)
    const evaluations = await evaluationsRepo
      .listAtCommitByDocument({
        commitUuid: commit.uuid,
        documentUuid,
      })
      .then((r) => r.unwrap())

    const evaluationUuids = evaluations.map((e) => e.uuid)

    if (evaluationUuids.length === 0) {
      return { results: [], hasNextPage: false }
    }

    const useClickHouse = await this.shouldUseClickHouse()

    if (useClickHouse) {
      const fetchLimit = limit * 2

      const allEvalResults = await listPaginatedHITLResultsByDocument(
        {
          workspaceId: workspace.id,
          evaluationUuids,
          excludeIssueId,
          commitUuids,
          afterDate,
          orderDirection,
          fetchLimit,
          offset,
        },
        this.db,
      )

      const seenSpans = new Set<string>()
      const deduplicatedResults = allEvalResults.filter(
        (result: HITLResultWithEvaluationRow) => {
          const spanKey = `${result.evaluated_span_id}:${result.evaluated_trace_id}`
          if (seenSpans.has(spanKey)) return false
          seenSpans.add(spanKey)
          return true
        },
      )

      const commitMap = new Map(commitHistory.map((c) => [c.uuid, c.id]))
      const mapped = deduplicatedResults
        .slice(0, pageSize + 1)
        .map((row: HITLResultWithEvaluationRow) => ({
          id: row.id,
          evaluatedSpanId: row.evaluated_span_id,
          evaluatedTraceId: row.evaluated_trace_id,
          createdAt: new Date(row.created_at),
          commitId: commitMap.get(row.commit_uuid),
          evaluationUuid: row.evaluation_uuid,
          type: EvaluationType.Human,
        }))
        .filter((r) => r.commitId !== undefined)

      const paginatedResults = mapped.slice(0, pageSize)
      const hasNextPage = mapped.length > pageSize
      const results = hasNextPage ? paginatedResults : mapped
      return { results: results as EvaluationResultV2[], hasNextPage }
    }

    const whereConditions = [
      eq(evaluationResultsV2.workspaceId, workspace.id),
      eq(evaluationResultsV2.type, EvaluationType.Human),
      isNotNull(evaluationResultsV2.evaluatedSpanId),
      isNotNull(evaluationResultsV2.evaluatedTraceId),
      isNull(commits.deletedAt),
      inArray(evaluationResultsV2.commitId, commitIds),
      isNull(issueEvaluationResults.id),
      inArray(evaluationResultsV2.evaluationUuid, evaluationUuids),
    ]

    if (afterDate) {
      whereConditions.push(
        gt(evaluationResultsV2.createdAt, new Date(afterDate)),
      )
    }

    const orderDirectionFn = orderDirection === 'asc' ? asc : desc

    // Fetch more results to account for duplicates during deduplication. We
    // multiply by 2 to have a buffer.
    const fetchLimit = limit * 2
    const allEvalResults = await this.db
      .select(tt)
      .from(evaluationResultsV2)
      .innerJoin(commits, eq(commits.id, evaluationResultsV2.commitId))
      .leftJoin(
        issueEvaluationResults,
        and(
          eq(issueEvaluationResults.evaluationResultId, evaluationResultsV2.id),
          eq(issueEvaluationResults.workspaceId, workspace.id),
          eq(issueEvaluationResults.issueId, excludeIssueId),
        ),
      )
      .where(and(...whereConditions))
      .orderBy(
        orderDirectionFn(evaluationResultsV2.createdAt),
        orderDirectionFn(evaluationResultsV2.id),
      )
      .limit(fetchLimit)
      .offset(offset)

    // Deduplicate by span (keep first occurrence which is the latest due to ordering)
    const seenSpans = new Set<string>()
    const deduplicatedResults = allEvalResults.filter((result) => {
      const spanKey = `${result.evaluatedSpanId}:${result.evaluatedTraceId}`
      if (seenSpans.has(spanKey)) {
        return false
      }
      seenSpans.add(spanKey)
      return true
    })

    const paginatedResults = deduplicatedResults.slice(0, pageSize)
    const hasNextPage = deduplicatedResults.length > pageSize
    const results = hasNextPage ? paginatedResults : deduplicatedResults
    return { results: results as EvaluationResultV2[], hasNextPage }
  }

  private async getEvaluationsByCommit({
    projectId,
    documentUuid,
    results,
  }: {
    documentUuid: string
    results: EvaluationResultV2[]
    projectId?: number
  }) {
    const evaluationsRepository = new EvaluationsV2Repository(
      this.workspaceId,
      this.db,
    )
    const commitUuids = [...new Set(results.map((r) => r.commitUuid))]
    return Object.fromEntries(
      await Promise.all(
        commitUuids.map(
          async (commitUuid) =>
            [
              commitUuid,
              await evaluationsRepository
                .listAtCommitByDocument({
                  projectId,
                  commitUuid,
                  documentUuid,
                })
                .then((r) => r.unwrap()),
            ] as const,
        ),
      ),
    )
  }

  async isFromOptimization(
    result: Pick<EvaluationResultV2, 'evaluatedTraceId' | 'evaluatedSpanId'>,
  ) {
    if (!result.evaluatedSpanId || !result.evaluatedTraceId) return false

    const span = await this.db
      .select({ source: spans.source })
      .from(spans)
      .where(
        and(
          eq(spans.traceId, result.evaluatedTraceId),
          eq(spans.id, result.evaluatedSpanId),
          eq(spans.workspaceId, this.workspaceId),
        ),
      )
      .limit(1)
      .then((r) => r[0])

    return span?.source === LogSources.Optimization
  }
}
