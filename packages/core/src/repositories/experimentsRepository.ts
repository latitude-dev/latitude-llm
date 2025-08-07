import {
  and,
  count,
  desc,
  eq,
  getTableColumns,
  isNotNull,
  isNull,
  sql,
  sum,
} from 'drizzle-orm'

import { ExperimentScores } from '@latitude-data/constants'
import { omit } from 'lodash-es'
import {
  ErrorableEntity,
  Experiment,
  ExperimentDto,
  ExperimentLogsMetadata,
} from '../browser'
import { LatitudeError, NotFoundError } from '../lib/errors'
import { Result } from '../lib/Result'
import { PromisedResult } from '../lib/Transaction'
import {
  commits,
  documentLogs,
  evaluationResultsV2,
  experiments,
  projects,
  providerLogs,
  runErrors,
} from '../schema'
import Repository from './repositoryV2'

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
      | { documentUuid: string; experimentUuid?: never }
      | { documentUuid?: never; experimentUuid: string },
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
          passedEvals: sql<number>`
            COUNT(CASE WHEN ${evaluationResultsV2.hasPassed} = TRUE THEN 1 END)
          `.as('passed_evals'),
          failedEvals: sql<number>`
            COUNT(CASE WHEN ${evaluationResultsV2.hasPassed} = FALSE THEN 1 END)
          `.as('failed_evals'),
          evalErrors: sql<number>`
            COUNT(CASE WHEN ${evaluationResultsV2.error} IS NOT NULL THEN 1 END)
          `.as('eval_errors'),
          totalScore: sql<number>`
            SUM(${evaluationResultsV2.normalizedScore})
          `.as('total_score'),
        })
        .from(evaluationResultsV2)
        .innerJoin(
          experiments,
          eq(evaluationResultsV2.experimentId, experiments.id),
        )
        .where(and(this.scopeFilter, condition))
        .groupBy(evaluationResultsV2.experimentId),
    )

    const logsCondition = params.documentUuid
      ? eq(documentLogs.documentUuid, params.documentUuid)
      : experiment
        ? eq(documentLogs.experimentId, experiment.id)
        : undefined

    if (!logsCondition) {
      return Result.error(
        new LatitudeError(`Invalid condition provided with params ${params}`),
      )
    }

    const logsAggregation = this.db.$with('logsAggregation').as(
      this.db
        .select({
          experimentId: documentLogs.experimentId,
          logErrors: sql<number>`COUNT(${runErrors.id})`.as('log_errors'),
        })
        .from(documentLogs)
        .innerJoin(runErrors, eq(runErrors.errorableUuid, documentLogs.uuid))
        .innerJoin(commits, eq(commits.id, documentLogs.commitId))
        .innerJoin(
          projects,
          and(
            eq(projects.id, commits.projectId),
            eq(projects.workspaceId, this.workspaceId),
          ),
        )
        .where(and(isNotNull(documentLogs.experimentId), logsCondition))
        .groupBy(documentLogs.experimentId),
    )

    return Result.ok(
      this.db.$with('aggregated_results').as(
        this.db
          .with(evaluationAggregation, logsAggregation)
          .select({
            id: experiments.id,
            passedEvals:
              sql<number>`MAX(${evaluationAggregation.passedEvals})`.as(
                'passed_evals',
              ),
            failedEvals:
              sql<number>`MAX(${evaluationAggregation.failedEvals})`.as(
                'failed_evals',
              ),
            evalErrors:
              sql<number>`MAX(${evaluationAggregation.evalErrors})`.as(
                'eval_errors',
              ),
            totalScore:
              sql<number>`MAX(${evaluationAggregation.totalScore})`.as(
                'total_score',
              ),
            logErrors: sql<number>`MAX(${logsAggregation.logErrors})`.as(
              'log_errors',
            ),
          })
          .from(experiments)
          .leftJoin(
            evaluationAggregation,
            eq(evaluationAggregation.experimentId, experiments.id),
          )
          .leftJoin(
            logsAggregation,
            eq(logsAggregation.experimentId, experiments.id),
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
        logErrors: aggregatedResults.logErrors,
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
        logErrors: aggregatedResults.logErrors,
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

  async getLogsMetadata(
    uuid: string,
  ): PromisedResult<ExperimentLogsMetadata, LatitudeError> {
    const experimentsCte = this.db.$with('experiments_cte').as(
      this.db
        .select({ id: experiments.id })
        .from(experiments)
        .where(and(this.scopeFilter, eq(experiments.uuid, uuid))),
    )

    const documentLogStats = this.db.$with('document_log_stats').as(
      this.db
        .with(experimentsCte)
        .select({
          experimentId: documentLogs.experimentId,
          logsCount: count(documentLogs.id).mapWith(Number).as('logs_count'),
          totalDuration: sum(documentLogs.duration)
            .mapWith(Number)
            .as('total_duration'),
        })
        .from(documentLogs)
        .leftJoin(
          runErrors,
          and(
            eq(runErrors.errorableUuid, documentLogs.uuid),
            eq(runErrors.errorableType, ErrorableEntity.DocumentLog),
          ),
        )
        .innerJoin(
          experimentsCte,
          eq(documentLogs.experimentId, experimentsCte.id),
        )
        .where(isNull(runErrors.id))
        .groupBy(documentLogs.experimentId),
    )

    const providerLogStats = this.db.$with('provider_log_stats').as(
      this.db
        .with(experimentsCte)
        .select({
          experimentId: documentLogs.experimentId,
          totalCost: sum(providerLogs.costInMillicents)
            .mapWith(Number)
            .as('total_cost'),
          totalTokens: sum(providerLogs.tokens)
            .mapWith(Number)
            .as('total_tokens'),
        })
        .from(documentLogs)
        .innerJoin(
          providerLogs,
          eq(providerLogs.documentLogUuid, documentLogs.uuid),
        )
        .leftJoin(
          runErrors,
          and(
            eq(runErrors.errorableUuid, documentLogs.uuid),
            eq(runErrors.errorableType, ErrorableEntity.DocumentLog),
          ),
        )
        .innerJoin(
          experimentsCte,
          eq(documentLogs.experimentId, experimentsCte.id),
        )
        .where(isNull(runErrors.id))
        .groupBy(documentLogs.experimentId),
    )

    const [row] = await this.db
      .with(experimentsCte, documentLogStats, providerLogStats)
      .select({
        id: experimentsCte.id,
        count: documentLogStats.logsCount,
        totalDuration: documentLogStats.totalDuration,
        totalCost: providerLogStats.totalCost,
        totalTokens: providerLogStats.totalTokens,
      })
      .from(experimentsCte)
      .leftJoin(
        documentLogStats,
        eq(documentLogStats.experimentId, experimentsCte.id),
      )
      .leftJoin(
        providerLogStats,
        eq(providerLogStats.experimentId, experimentsCte.id),
      )

    if (!row) {
      return Result.ok({
        count: 0,
        totalCost: 0,
        totalTokens: 0,
        totalDuration: 0,
      })
    }

    return Result.ok({
      count: row.count,
      totalCost: row.totalCost,
      totalDuration: row.totalDuration,
      totalTokens: row.totalTokens,
    })
  }

  private experimentDtoPresenter = (
    row: Experiment & {
      passedEvals: number
      failedEvals: number
      evalErrors: number
      logErrors: number
      totalScore: number
    },
  ): ExperimentDto => {
    return {
      ...omit(row, [
        'passedEvals',
        'failedEvals',
        'evalErrors',
        'logErrors',
        'totalScore',
      ]),
      results: {
        passed: Number(row.passedEvals),
        failed: Number(row.failedEvals),
        errors:
          Number(row.evalErrors) +
          row.evaluationUuids.length * Number(row.logErrors),
        totalScore: Number(row.totalScore),
      },
    }
  }
}
