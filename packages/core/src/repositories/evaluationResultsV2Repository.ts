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
  ISSUE_GENERATION_MAX_RESULTS,
  ISSUE_GENERATION_RECENCY_DAYS,
  ISSUE_GENERATION_RECENCY_RATIO,
  MAX_EVALUATION_RESULTS_PER_DOCUMENT_SUGGESTION,
  Span,
} from '../constants'
import { EvaluationResultsV2Search } from '../helpers'
import { NotFoundError } from '../lib/errors'
import { calculateOffset } from '../lib/pagination/index'
import { Result } from '../lib/Result'
import { commits } from '../schema/models/commits'
import { datasetRows } from '../schema/models/datasetRows'
import { datasets } from '../schema/models/datasets'
import { evaluationResultsV2 } from '../schema/models/evaluationResultsV2'
import { issueEvaluationResults } from '../schema/models/issueEvaluationResults'
import { providerLogs } from '../schema/models/providerLogs'
import {
  EvaluationResultV2WithDetails,
  EvaluationV2Stats,
  ResultWithEvaluationV2,
} from '../schema/types'
import { EvaluationsV2Repository } from './evaluationsV2Repository'
import { IssueEvaluationResultsRepository } from './issueEvaluationResultsRepository'
import Repository from './repositoryV2'
import { evaluationVersions } from '../schema/models/evaluationVersions'
import { CommitsRepository } from './commitsRepository'
import { Commit } from '../schema/models/types/Commit'
import { Issue } from '../schema/models/types/Issue'
import { Workspace } from '../schema/models/types/Workspace'

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

  async findByEvaluatedSpanAndEvaluation({
    evaluatedSpanId,
    evaluatedTraceId,
    evaluationUuid,
  }: {
    evaluatedSpanId: string
    evaluatedTraceId: string
    evaluationUuid: string
  }) {
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

    return Result.ok<EvaluationResultV2WithDetails[]>(
      (await query) as EvaluationResultV2WithDetails[],
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

  async listBySpans(spans: Span[]) {
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
          inArray(evaluationResultsV2.evaluatedTraceId, traceIds),
        ),
      )
      .orderBy(
        desc(evaluationResultsV2.createdAt),
        desc(evaluationResultsV2.id),
      )

    return Result.ok(results)
  }

  // Be careful using this with merged issues, as there will be multiple evaluation results for the same issue
  async listByIssueIds(issueIds: number[], commitHistoryIds: number[]) {
    const uniqueIssueIds = [...new Set(issueIds)].filter(Boolean)
    if (!uniqueIssueIds.length) {
      return []
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

    return results as (EvaluationResultV2 & { joinedIssueId: number })[]
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

    const evaluationsByCommit = await this.getEvaluationsByCommit({
      projectId: projectId!,
      documentUuid,
      results: results as (Omit<EvaluationResultV2, 'score'> & {
        commitUuid: string
      })[],
    })

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

  async listBySpanTrace({
    projectId,
    documentUuid,
    spanId,
    traceId,
  }: {
    projectId?: number
    documentUuid: string
    spanId: string
    traceId: string
  }) {
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
          eq(evaluationResultsV2.evaluatedSpanId, spanId),
          eq(evaluationResultsV2.evaluatedTraceId, traceId),
        ),
      )
      .orderBy(
        desc(evaluationResultsV2.createdAt),
        desc(evaluationResultsV2.id),
      )

    const evaluationsByCommit = await this.getEvaluationsByCommit({
      projectId: projectId!,
      documentUuid,
      results: results as (Omit<EvaluationResultV2, 'score'> & {
        commitUuid: string
      })[],
    })

    // Fetch active issues for all results and add issueId to result
    const issueEvalResultsRepo = new IssueEvaluationResultsRepository(
      this.workspaceId,
      this.db,
    )

    const resultsWithEvaluations: ResultWithEvaluationV2[] = []
    for (const result of results) {
      const evaluation = evaluationsByCommit[result.commitUuid]!.find(
        (e) => e.uuid === result.evaluationUuid,
      )
      if (!evaluation) continue

      // Find the active issue for this result
      const activeAssignment =
        await issueEvalResultsRepo.findLastActiveAssignedIssue({
          result: result as EvaluationResultV2,
        })

      // Add issueId to result for backward compatibility
      const resultWithIssue = {
        ...result,
        issueId: activeAssignment?.issueId ?? null,
      } as EvaluationResultV2

      resultsWithEvaluations.push({
        result: resultWithIssue,
        evaluation,
      } as ResultWithEvaluationV2)
    }

    return Result.ok<ResultWithEvaluationV2[]>(resultsWithEvaluations)
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

  async selectForIssueGeneration({ issueId }: { issueId: number }) {
    const conditions = [
      this.scopeFilter,
      eq(issueEvaluationResults.issueId, issueId),
      isNotNull(commits.mergedAt),
      isNull(evaluationResultsV2.error),
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

    return Result.ok<EvaluationResultV2[]>(results as EvaluationResultV2[])
  }

  async fetchPaginatedHITLResultsByIssue({
    workspace,
    commit,
    issue,
    page,
    pageSize,
  }: {
    workspace: Workspace
    commit: Commit
    issue: Issue
    page: number
    pageSize: number
  }) {
    const commitsRepo = new CommitsRepository(workspace.id, this.db)
    const commitHistory = await commitsRepo.getCommitsHistory({ commit })
    const commitIds = commitHistory.map((c) => c.id)
    const limit = pageSize + 1
    const offset = calculateOffset(page, pageSize)
    const evalResults = await this.db
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
      .innerJoin(
        evaluationVersions,
        eq(
          evaluationResultsV2.evaluationUuid,
          evaluationVersions.evaluationUuid,
        ),
      )
      .innerJoin(commits, eq(commits.id, evaluationResultsV2.commitId))
      .where(
        and(
          eq(issueEvaluationResults.workspaceId, workspace.id),
          eq(issueEvaluationResults.issueId, issue.id),
          eq(evaluationVersions.type, EvaluationType.Human),
          isNotNull(evaluationResultsV2.evaluatedSpanId),
          isNotNull(evaluationResultsV2.evaluatedTraceId),
          isNull(commits.deletedAt),
          inArray(evaluationResultsV2.commitId, commitIds),
        ),
      )
      .orderBy(
        desc(evaluationResultsV2.createdAt),
        desc(evaluationResultsV2.id),
      )
      .limit(limit)
      .offset(offset)

    const hasNextPage = evalResults.length > pageSize
    const results = hasNextPage ? evalResults.slice(0, pageSize) : evalResults
    return { results, hasNextPage }
  }

  async fetchPaginatedHITLResultsByDocument({
    workspace,
    commit,
    documentUuid,
    excludeIssueId,
    page,
    pageSize,
  }: {
    workspace: Workspace
    commit: Commit
    documentUuid: string
    excludeIssueId: number
    page: number
    pageSize: number
  }) {
    const commitsRepo = new CommitsRepository(workspace.id, this.db)
    const commitHistory = await commitsRepo.getCommitsHistory({ commit })
    const commitIds = commitHistory.map((c) => c.id)
    const limit = pageSize + 1
    const offset = calculateOffset(page, pageSize)
    const evalResults = await this.db
      .select({
        id: evaluationResultsV2.id,
        evaluatedSpanId: evaluationResultsV2.evaluatedSpanId,
        evaluatedTraceId: evaluationResultsV2.evaluatedTraceId,
        createdAt: evaluationResultsV2.createdAt,
      })
      .from(evaluationResultsV2)
      .innerJoin(
        evaluationVersions,
        and(
          eq(
            evaluationResultsV2.evaluationUuid,
            evaluationVersions.evaluationUuid,
          ),
          eq(evaluationVersions.documentUuid, documentUuid),
        ),
      )
      .innerJoin(commits, eq(commits.id, evaluationResultsV2.commitId))
      .leftJoin(
        issueEvaluationResults,
        and(
          eq(issueEvaluationResults.evaluationResultId, evaluationResultsV2.id),
          eq(issueEvaluationResults.workspaceId, workspace.id),
          eq(issueEvaluationResults.issueId, excludeIssueId),
        ),
      )
      .where(
        and(
          eq(evaluationResultsV2.workspaceId, workspace.id),
          eq(evaluationVersions.type, EvaluationType.Human),
          isNotNull(evaluationResultsV2.evaluatedSpanId),
          isNotNull(evaluationResultsV2.evaluatedTraceId),
          isNull(commits.deletedAt),
          inArray(evaluationResultsV2.commitId, commitIds),
          // Exclude spans that have evaluation results linked to the specific issue
          isNull(issueEvaluationResults.id),
        ),
      )
      .orderBy(
        desc(evaluationResultsV2.createdAt),
        desc(evaluationResultsV2.id),
      )
      .limit(limit)
      .offset(offset)

    const hasNextPage = evalResults.length > pageSize
    const results = hasNextPage ? evalResults.slice(0, pageSize) : evalResults
    return { results, hasNextPage }
  }

  private async getEvaluationsByCommit({
    projectId,
    documentUuid,
    results,
  }: {
    documentUuid: string
    results: Array<
      Omit<EvaluationResultV2, 'score'> & {
        commitUuid: string
      }
    >
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
                .list({
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
}
