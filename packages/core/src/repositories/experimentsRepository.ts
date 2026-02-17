import {
  and,
  count,
  countDistinct,
  desc,
  eq,
  getTableColumns,
  inArray,
  sql,
  sum,
} from 'drizzle-orm'

import { ExperimentScores, SpanType } from '@latitude-data/constants'
import { omit } from 'lodash-es'
import { LatitudeError, NotFoundError } from '../lib/errors'
import { Result } from '../lib/Result'
import { PromisedResult } from '../lib/Transaction'
import { evaluationResultsV2 } from '../schema/models/evaluationResultsV2'
import { experiments } from '../schema/models/experiments'
import { spans } from '../schema/models/spans'
import {
  ExperimentDto,
  ExperimentRunMetadata,
  type Experiment,
} from '../schema/models/types/Experiment'
import Repository from './repositoryV2'
import { isClickHouseSpansReadEnabled } from '../services/workspaceFeatures/isClickHouseSpansReadEnabled'
import { getExperimentRunMetadata as chGetExperimentRunMetadata } from '../queries/clickhouse/spans/getExperimentRunMetadata'

export class ExperimentsRepository extends Repository<Experiment> {
  get scopeFilter() {
    return eq(experiments.workspaceId, this.workspaceId)
  }

  get scope() {
    return this.db
      .select(getTableColumns(experiments))
      .from(experiments)
      .where(this.scopeFilter)
      .$dynamic()
  }

  private async aggregatedResultsSubquery(
    params:
      | { documentUuid: string; experimentUuid?: never; ids?: never }
      | { documentUuid?: never; experimentUuid: string; ids?: never }
      | { documentUuid?: never; experimentUuid?: never; ids: number[] },
  ) {
    const experiment = params.experimentUuid
      ? await this.db
          .select({ id: experiments.id, uuid: experiments.uuid })
          .from(experiments)
          .where(
            and(this.scopeFilter, eq(experiments.uuid, params.experimentUuid)),
          )
          .limit(1)
          .then((r) => r[0])
      : undefined

    if (params.experimentUuid && !experiment) {
      return Result.error(
        new NotFoundError(
          `Experiment with uuid ${params.experimentUuid} not found`,
        ),
      )
    }

    const condition = params.documentUuid
      ? eq(experiments.documentUuid, params.documentUuid)
      : experiment
        ? eq(experiments.uuid, experiment.uuid)
        : params.ids?.length
          ? inArray(experiments.id, params.ids)
          : undefined

    if (!condition) {
      return Result.error(
        new LatitudeError(`Invalid condition provided with params ${params}`),
      )
    }

    const evaluationAggregation = this.db.$with('evaluationAggregation').as(
      this.db
        .select({
          experimentId: evaluationResultsV2.experimentId,
          passedEvals:
            sql<number>`COUNT(CASE WHEN ${evaluationResultsV2.hasPassed} = TRUE THEN 1 END)`
              .mapWith(Number)
              .as('passed_evals'),
          failedEvals:
            sql<number>`COUNT(CASE WHEN ${evaluationResultsV2.hasPassed} = FALSE THEN 1 END)`
              .mapWith(Number)
              .as('failed_evals'),
          evalErrors:
            sql<number>`COUNT(CASE WHEN ${evaluationResultsV2.error} IS NOT NULL THEN 1 END)`
              .mapWith(Number)
              .as('eval_errors'),
          totalScore: sql<number>`SUM(${evaluationResultsV2.normalizedScore})`
            .mapWith(Number)
            .as('total_score'),
        })
        .from(evaluationResultsV2)
        .innerJoin(
          experiments,
          eq(evaluationResultsV2.experimentId, experiments.id),
        )
        .where(and(this.scopeFilter, condition))
        .groupBy(evaluationResultsV2.experimentId),
    )

    return Result.ok(
      this.db.$with('aggregated_results').as(
        this.db
          .with(evaluationAggregation)
          .select({
            id: experiments.id,
            passedEvals: sql<number>`MAX(${evaluationAggregation.passedEvals})`
              .mapWith(Number)
              .as('passed_evals'),
            failedEvals: sql<number>`MAX(${evaluationAggregation.failedEvals})`
              .mapWith(Number)
              .as('failed_evals'),
            evalErrors: sql<number>`MAX(${evaluationAggregation.evalErrors})`
              .mapWith(Number)
              .as('eval_errors'),
            totalScore: sql<number>`MAX(${evaluationAggregation.totalScore})`
              .mapWith(Number)
              .as('total_score'),
          })
          .from(experiments)
          .leftJoin(
            evaluationAggregation,
            eq(evaluationAggregation.experimentId, experiments.id),
          )
          .groupBy(experiments.id),
      ),
    )
  }

  async findByDocumentUuid({
    documentUuid,
    page,
    pageSize,
  }: {
    documentUuid: string
    page: number
    pageSize: number
  }): Promise<ExperimentDto[]> {
    const aggregatedResults = await this.aggregatedResultsSubquery({
      documentUuid,
    }).then((r) => r.unwrap())

    const results = await this.db
      .with(aggregatedResults)
      .select({
        ...getTableColumns(experiments),
        passedEvals: aggregatedResults.passedEvals,
        failedEvals: aggregatedResults.failedEvals,
        evalErrors: aggregatedResults.evalErrors,
        totalScore: aggregatedResults.totalScore,
      })
      .from(experiments)
      .leftJoin(aggregatedResults, eq(aggregatedResults.id, experiments.id))
      .where(and(this.scopeFilter, eq(experiments.documentUuid, documentUuid)))
      .orderBy(desc(experiments.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize)

    return results.map(this.experimentDtoPresenter)
  }

  async countByDocumentUuid(documentUuid: string): Promise<number> {
    const result = await this.db
      .select({
        count: count(experiments.id).as('count'),
      })
      .from(experiments)
      .where(and(this.scopeFilter, eq(experiments.documentUuid, documentUuid)))

    return result[0]?.count ?? 0
  }

  async findByUuid(uuid: string): PromisedResult<ExperimentDto, LatitudeError> {
    const result = await this.aggregatedResultsSubquery({
      experimentUuid: uuid,
    })
    if (result.error) return result
    const aggregatedResults = result.unwrap()

    const results = await this.db
      .with(aggregatedResults)
      .select({
        ...getTableColumns(experiments),
        passedEvals: aggregatedResults.passedEvals,
        failedEvals: aggregatedResults.failedEvals,
        evalErrors: aggregatedResults.evalErrors,
        totalScore: aggregatedResults.totalScore,
      })
      .from(experiments)
      .leftJoin(aggregatedResults, eq(aggregatedResults.id, experiments.id))
      .where(and(this.scopeFilter, eq(experiments.uuid, uuid)))

    if (!results.length) {
      return Result.error(
        new NotFoundError(`Experiment not found with uuid '${uuid}'`),
      )
    }

    return Result.ok(this.experimentDtoPresenter(results[0]!))
  }

  async findByIds(ids: number[]): Promise<ExperimentDto[]> {
    if (!ids.length) return []

    const aggregatedResults = await this.aggregatedResultsSubquery({
      ids,
    }).then((r) => r.unwrap())

    const results = await this.db
      .with(aggregatedResults)
      .select({
        ...getTableColumns(experiments),
        passedEvals: aggregatedResults.passedEvals,
        failedEvals: aggregatedResults.failedEvals,
        evalErrors: aggregatedResults.evalErrors,
        totalScore: aggregatedResults.totalScore,
      })
      .from(experiments)
      .leftJoin(aggregatedResults, eq(aggregatedResults.id, experiments.id))
      .where(and(this.scopeFilter, inArray(experiments.id, ids)))
      .orderBy(desc(experiments.createdAt))

    return results.map(this.experimentDtoPresenter)
  }

  async getScores(
    uuid: string,
  ): PromisedResult<ExperimentScores, LatitudeError> {
    const result = await this.db
      .select({
        experimentUuid: experiments.uuid,
        evaluationUuid: evaluationResultsV2.evaluationUuid,
        count: count(evaluationResultsV2.id).mapWith(Number).as('count'),
        totalScore: sum(evaluationResultsV2.score)
          .mapWith(Number)
          .as('total_score'),
        totalNormalizedScore: sum(evaluationResultsV2.normalizedScore)
          .mapWith(Number)
          .as('total_normalized_score'),
      })
      .from(experiments)
      .leftJoin(
        evaluationResultsV2,
        eq(evaluationResultsV2.experimentId, experiments.id),
      )
      .where(and(this.scopeFilter, eq(experiments.uuid, uuid)))
      .groupBy(experiments.uuid, evaluationResultsV2.evaluationUuid)

    if (!result.length) {
      return Result.error(
        new NotFoundError(`Experiment not found with uuid '${uuid}'`),
      )
    }

    return Result.ok(
      result
        .filter((r) => !!r.evaluationUuid)
        .reduce((acc: ExperimentScores, r) => {
          acc[r.evaluationUuid!] = {
            count: r.count,
            totalScore: r.totalScore,
            totalNormalizedScore: r.totalNormalizedScore,
          }
          return acc
        }, {}),
    )
  }

  async getRunMetadata(
    uuid: string,
  ): PromisedResult<ExperimentRunMetadata, LatitudeError> {
    const shouldUseClickHouse = await isClickHouseSpansReadEnabled(
      this.workspaceId,
      this.db,
    )

    if (shouldUseClickHouse) {
      const metadata = await chGetExperimentRunMetadata({
        workspaceId: this.workspaceId,
        experimentUuid: uuid,
      })

      return Result.ok(metadata)
    }

    const experimentTraceIds = this.db
      .selectDistinct({ traceId: spans.traceId })
      .from(spans)
      .where(
        and(
          eq(spans.workspaceId, this.workspaceId),
          eq(spans.experimentUuid, uuid),
        ),
      )

    const [runStats] = await this.db
      .select({
        count: countDistinct(spans.traceId).mapWith(Number),
        totalDuration: sum(spans.duration).mapWith(Number),
      })
      .from(spans)
      .where(
        and(
          eq(spans.workspaceId, this.workspaceId),
          inArray(spans.traceId, experimentTraceIds),
          inArray(spans.type, [SpanType.Prompt, SpanType.Chat]),
        ),
      )

    const [completionStats] = await this.db
      .select({
        totalCost: sum(spans.cost).mapWith(Number),
        totalTokens: sql<number>`
          COALESCE(SUM(
            COALESCE(${spans.tokensPrompt}, 0) +
            COALESCE(${spans.tokensCached}, 0) +
            COALESCE(${spans.tokensReasoning}, 0) +
            COALESCE(${spans.tokensCompletion}, 0)
          ), 0)
        `.mapWith(Number),
      })
      .from(spans)
      .where(
        and(
          eq(spans.workspaceId, this.workspaceId),
          inArray(spans.traceId, experimentTraceIds),
          eq(spans.type, SpanType.Completion),
        ),
      )

    return Result.ok({
      count: runStats?.count ?? 0,
      totalCost: completionStats?.totalCost ?? 0,
      totalDuration: runStats?.totalDuration ?? 0,
      totalTokens: completionStats?.totalTokens ?? 0,
    })
  }

  private experimentDtoPresenter = (
    row: Experiment & {
      passedEvals: number
      failedEvals: number
      evalErrors: number
      totalScore: number
    },
  ): ExperimentDto => {
    const passedEvals = row.passedEvals ?? 0
    const failedEvals = row.failedEvals ?? 0
    const evalErrors = row.evalErrors ?? 0
    const totalScore = row.totalScore ?? 0

    const completedEvals = passedEvals + failedEvals + evalErrors
    const evalCount = row.evaluationUuids.length

    const fullEvalCyclesEstimation =
      evalCount > 0 ? Math.floor(completedEvals / evalCount) : 0

    const completedEstimation = fullEvalCyclesEstimation

    return {
      ...omit(row, ['passedEvals', 'failedEvals', 'evalErrors', 'totalScore']),

      results: {
        total: row.metadata.count,
        completed: completedEstimation,

        passed: passedEvals,
        failed: failedEvals,
        errors: evalErrors,

        totalScore,
        documentRunsCompleted: row.metadata.count,
      },
    }
  }
}
