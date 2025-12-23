import { and, desc, eq, getTableColumns, or, sql } from 'drizzle-orm'
import { DEFAULT_PAGINATION_SIZE, EvaluationV2 } from '../constants'
import { NotFoundError } from '../lib/errors'
import { Result } from '../lib/Result'
import { optimizations } from '../schema/models/optimizations'
import { type DocumentVersion } from '../schema/models/types/DocumentVersion'
import { Optimization } from '../schema/models/types/Optimization'
import { OptimizationWithDetails } from '../schema/types'
import { CommitsRepository } from './commitsRepository'
import { DatasetsRepository } from './datasetsRepository'
import { DocumentVersionsRepository } from './documentVersionsRepository'
import { EvaluationsV2Repository } from './evaluationsV2Repository'
import { ExperimentsRepository } from './experimentsRepository'
import Repository from './repositoryV2'

const tt = getTableColumns(optimizations)

export class OptimizationsRepository extends Repository<Optimization> {
  get scopeFilter() {
    return eq(optimizations.workspaceId, this.workspaceId)
  }

  get scope() {
    return this.db
      .select(tt)
      .from(optimizations)
      .where(this.scopeFilter)
      .orderBy(desc(optimizations.createdAt), desc(optimizations.id))
      .$dynamic()
  }

  async findByUuid(uuid: string) {
    const result = await this.scope
      .where(and(this.scopeFilter, eq(optimizations.uuid, uuid)))
      .limit(1)
      .then((r) => r[0])

    if (!result) {
      return Result.error(
        new NotFoundError(
          `Record with uuid ${uuid} not found in ${this.scope._.tableName}`,
        ),
      )
    }

    return Result.ok<Optimization>(result)
  }

  async findByExperiment(experimentId: number) {
    const result = await this.scope
      .where(
        and(
          this.scopeFilter,
          or(
            eq(optimizations.baselineExperimentId, experimentId),
            eq(optimizations.optimizedExperimentId, experimentId),
          ),
        ),
      )
      .limit(1)
      .then((r) => r[0])

    if (!result) {
      return Result.error(
        new NotFoundError(
          `Record with experiment id ${experimentId} not found in ${this.scope._.tableName}`,
        ),
      )
    }

    return Result.ok<Optimization>(result)
  }

  async listByDocument({
    documentUuid,
    page = 1,
    pageSize = DEFAULT_PAGINATION_SIZE,
  }: {
    documentUuid: string
    page?: number
    pageSize?: number
  }) {
    const result = await this.scope
      .where(
        and(this.scopeFilter, eq(optimizations.documentUuid, documentUuid)),
      )
      .orderBy(desc(optimizations.createdAt), desc(optimizations.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize)

    return Result.ok<Optimization[]>(result)
  }

  async positionByDocument({
    optimizationUuid,
    documentUuid,
    pageSize = DEFAULT_PAGINATION_SIZE,
  }: {
    optimizationUuid: string
    documentUuid: string
    pageSize?: number
  }) {
    const finding = await this.findByUuid(optimizationUuid)
    if (finding.error) {
      return Result.nil()
    }
    const optimization = finding.value

    const position = await this.db
      .select({
        count: sql`count(*)`.mapWith(Number).as('count'),
      })
      .from(optimizations)
      .where(
        and(
          this.scopeFilter,
          eq(optimizations.documentUuid, documentUuid),
          sql`(${optimizations.createdAt}, ${optimizations.id}) >= (${new Date(optimization.createdAt).toISOString()}, ${optimization.id})`,
        ),
      )
      .then((r) => r[0]?.count)
    if (position === undefined) {
      return Result.nil()
    }

    const page = Math.ceil(position / pageSize)

    return Result.ok<number>(page)
  }

  async countByDocument({ documentUuid }: { documentUuid: string }) {
    const result = await this.db
      .select({
        count: sql`count(*)`.mapWith(Number).as('count'),
      })
      .from(optimizations)
      .where(
        and(this.scopeFilter, eq(optimizations.documentUuid, documentUuid)),
      )
      .then((r) => r[0]?.count ?? 0)

    return Result.ok<number>(result)
  }

  private async withDetails(optimizations: Optimization[]) {
    // Note: this function ignores errors related to deleted entities
    const [commits, documents, evaluations, datasets, experiments] =
      await Promise.all([
        (async () => {
          const repository = new CommitsRepository(this.workspaceId)
          const commitIds = [
            ...new Set(
              optimizations
                .map((o) => o.baselineCommitId)
                .concat(
                  optimizations
                    .filter((o) => o.optimizedCommitId)
                    .map((o) => o.optimizedCommitId!),
                ),
            ),
          ]
          const commitMds = await repository.getCommitsByIds(commitIds)
          return Object.fromEntries(commitMds.map((c) => [c.id, c]))
        })(),
        (async () => {
          const repository = new DocumentVersionsRepository(this.workspaceId)
          const documents: Record<number, Record<string, DocumentVersion>> = {}
          for (const o of optimizations) {
            if (documents[o.baselineCommitId]) continue

            const list = await repository
              .listDocumentsAtCommit({
                commitId: o.baselineCommitId,
              })
              .then((r) => r.value ?? [])

            documents[o.baselineCommitId] = list.reduce(
              (acc, document) => {
                acc[document.documentUuid] = document
                return acc
              },
              {} as Record<string, DocumentVersion>,
            )
          }
          return documents
        })(),
        (async () => {
          const repository = new EvaluationsV2Repository(this.workspaceId)
          const evaluations: Record<number, Record<string, EvaluationV2>> = {}
          for (const o of optimizations) {
            if (evaluations[o.baselineCommitId]) continue

            const list = await repository
              .listAtCommitByDocument({
                commitId: o.baselineCommitId,
                documentUuid: o.documentUuid,
              })
              .then((r) => r.value ?? [])

            evaluations[o.baselineCommitId] = list.reduce(
              (acc, evaluation) => {
                acc[evaluation.uuid] = evaluation
                return acc
              },
              {} as Record<string, EvaluationV2>,
            )
          }
          return evaluations
        })(),
        (async () => {
          const repository = new DatasetsRepository(this.workspaceId)
          const datasetIds = [
            ...new Set(
              optimizations
                .filter((o) => o.trainsetId)
                .map((o) => o.trainsetId!)
                .concat(
                  optimizations
                    .filter((o) => o.testsetId)
                    .map((o) => o.testsetId!),
                ),
            ),
          ]
          const datasetMds = await repository
            .findMany(datasetIds)
            .then((r) => r.value ?? [])
          return Object.fromEntries(datasetMds.map((d) => [d.id, d]))
        })(),
        (async () => {
          const repository = new ExperimentsRepository(this.workspaceId)
          const experimentIds = [
            ...new Set(
              optimizations
                .filter((o) => o.baselineExperimentId)
                .map((o) => o.baselineExperimentId!)
                .concat(
                  optimizations
                    .filter((o) => o.optimizedExperimentId)
                    .map((o) => o.optimizedExperimentId!),
                ),
            ),
          ]
          const experimentMds = await repository.findByIds(experimentIds)
          return Object.fromEntries(experimentMds.map((e) => [e.id, e]))
        })(),
      ])

    const result = optimizations.map((optimization) => ({
      ...optimization,
      document: documents[optimization.baselineCommitId]?.[optimization.documentUuid], // prettier-ignore
      evaluation: evaluations[optimization.baselineCommitId]?.[optimization.evaluationUuid], // prettier-ignore
      trainset: optimization.trainsetId ? datasets[optimization.trainsetId] : undefined, // prettier-ignore
      testset: optimization.testsetId ? datasets[optimization.testsetId] : undefined, // prettier-ignore
      baselineCommit: commits[optimization.baselineCommitId]!, // prettier-ignore
      baselineExperiment: optimization.baselineExperimentId ? experiments[optimization.baselineExperimentId] : undefined, // prettier-ignore
      optimizedCommit: optimization.optimizedCommitId ? commits[optimization.optimizedCommitId] : undefined, // prettier-ignore
      optimizedExperiment: optimization.optimizedExperimentId ? experiments[optimization.optimizedExperimentId] : undefined, // prettier-ignore
    }))

    return Result.ok<OptimizationWithDetails[]>(result)
  }

  async findWithDetails(id: number) {
    const result = await this.find(id).then((r) => r.unwrap())
    const detailed = await this.withDetails([result]).then((r) => r.unwrap())
    return Result.ok<OptimizationWithDetails>(detailed[0]!)
  }

  async listByDocumentWithDetails({
    documentUuid,
    page = 1,
    pageSize = DEFAULT_PAGINATION_SIZE,
  }: {
    documentUuid: string
    page?: number
    pageSize?: number
  }) {
    const result = await this.listByDocument({ documentUuid, page, pageSize }).then((r) => r.unwrap()) // prettier-ignore
    const detailed = await this.withDetails(result).then((r) => r.unwrap())
    return Result.ok<OptimizationWithDetails[]>(detailed)
  }
}
