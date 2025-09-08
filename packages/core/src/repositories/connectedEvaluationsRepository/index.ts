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

import {
  ConnectedEvaluation,
  DocumentVersion,
  EvaluationDto,
} from '../../browser'
import { LatitudeError } from '../../lib/errors'
import { Result, TypedResult } from '../../lib/Result'
import {
  connectedEvaluations,
  documentLogs,
  evaluations,
  providerLogs,
} from '../../schema'
import { DocumentVersionsRepository } from '../documentVersionsRepository'
import { EvaluationResultsRepository } from '../evaluationResultsRepository'
import { EvaluationsRepository } from '../evaluationsRepository'
import RepositoryLegacy from '../repository'

const tt = getTableColumns(connectedEvaluations)

export type ConnectedDocumentWithMetadata = DocumentVersion & {
  projectId: number // This is automatically provided by the DocumentVersionsRepository
  evaluationUuid: string
  evaluationId: number
  evaluationLogs: number
  totalTokens: number
  costInMillicents: number
  modalValue: string | null
  modalValueCount: number
}

export type ConnectedEvaluationWithDetails = ConnectedEvaluation & {
  evaluation: EvaluationDto
}

export class ConnectedEvaluationsRepository extends RepositoryLegacy<
  typeof tt,
  ConnectedEvaluation
> {
  get scope() {
    return this.db
      .select(tt)
      .from(connectedEvaluations)
      .innerJoin(
        evaluations,
        and(
          isNull(evaluations.deletedAt),
          eq(connectedEvaluations.evaluationId, evaluations.id),
        ),
      )
      .where(eq(evaluations.workspaceId, this.workspaceId))
      .as('connectedEvaluationsScope')
  }

  async findByEvaluationId(id: number) {
    const result = await this.db
      .select()
      .from(this.scope)
      .where(eq(this.scope.evaluationId, id))

    return Result.ok(result)
  }

  async filterByDocumentUuid(uuid: string) {
    const result = await this.db
      .select()
      .from(this.scope)
      .where(eq(this.scope.documentUuid, uuid))

    return Result.ok(result)
  }

  async findByDocumentAndEvaluation(
    documentUuid: string,
    evaluationId: number,
  ) {
    const result = await this.db
      .select()
      .from(this.scope)
      .where(
        and(
          eq(this.scope.documentUuid, documentUuid),
          eq(this.scope.evaluationId, evaluationId),
        ),
      )

    return Result.ok(result[0])
  }

  async filterWithDetailsByDocumentUuid(
    uuid: string,
  ): Promise<TypedResult<ConnectedEvaluationWithDetails[], LatitudeError>> {
    const evaluationsScope = new EvaluationsRepository(
      this.workspaceId,
      this.db,
    )

    const result = await this.db
      .select({
        ...this.scope._.selectedFields,
        evaluation: {
          ...evaluationsScope.scope._.selectedFields,
        },
      })
      .from(this.scope)
      .innerJoin(
        evaluationsScope.scope,
        eq(evaluationsScope.scope.id, this.scope.evaluationId),
      )
      .where(eq(this.scope.documentUuid, uuid))

    return Result.ok(result as ConnectedEvaluationWithDetails[])
  }

  async getConnectedDocumentsWithMetadata(
    evaluationId: number,
  ): Promise<TypedResult<ConnectedDocumentWithMetadata[], LatitudeError>> {
    const documentVersionsScope = new DocumentVersionsRepository(
      this.workspaceId,
      this.db,
    )
    const evaluationsScope = new EvaluationsRepository(
      this.workspaceId,
      this.db,
    )

    const lastVersionOfEachDocument = this.db // Last version of each (merged) document
      .$with('last_version_of_each_document')
      .as(
        this.db
          .selectDistinctOn(
            [documentVersionsScope.scope.documentUuid],
            documentVersionsScope.scope._.selectedFields,
          )
          .from(documentVersionsScope.scope)
          .where(isNotNull(documentVersionsScope.scope.mergedAt)) // Only take merged versions into account
          .orderBy(
            documentVersionsScope.scope.documentUuid,
            desc(documentVersionsScope.scope.mergedAt),
          ),
      )

    const connectedDocuments = this.db.$with('connected_documents').as(
      this.db
        .with(lastVersionOfEachDocument)
        .select({
          ...lastVersionOfEachDocument._.selectedFields,
          evaluationUuid: evaluationsScope.scope.uuid,
          evaluationId: sql`${evaluationsScope.scope.id}`
            .mapWith(Number)
            .as('evaluation_id'),
        })
        .from(lastVersionOfEachDocument)
        .innerJoin(
          this.scope,
          eq(this.scope.documentUuid, lastVersionOfEachDocument.documentUuid),
        )
        .innerJoin(
          evaluationsScope.scope,
          eq(evaluationsScope.scope.id, this.scope.evaluationId),
        )
        .where(
          and(
            eq(this.scope.evaluationId, evaluationId),
            isNull(lastVersionOfEachDocument.deletedAt), // Only show non-removed documents
          ),
        ),
    )

    const { scope } = new EvaluationResultsRepository(this.workspaceId, this.db)
    const evaluationResultsScope = scope.as('evaluation_results_repo')
    const selectedEvaluationResults = this.db
      .$with('selected_evaluation_results')
      .as(
        this.db
          .select({
            ...evaluationResultsScope._.selectedFields,
            ...getTableColumns(documentLogs),
            ...getTableColumns(providerLogs),
          })
          .from(evaluationResultsScope)
          .innerJoin(
            documentLogs,
            eq(documentLogs.id, evaluationResultsScope.documentLogId),
          )
          .innerJoin(
            providerLogs,
            eq(providerLogs.id, evaluationResultsScope.evaluationProviderLogId),
          )
          .where(eq(evaluationResultsScope.evaluationId, evaluationId)),
      )

    const aggregatedResults = this.db
      .with(selectedEvaluationResults)
      .select({
        documentUuid: selectedEvaluationResults.documentUuid,
        evaluationLogs: count(selectedEvaluationResults.id).as(
          'evaluation_logs',
        ),
        totalTokens: sum(selectedEvaluationResults.tokens).as('total_tokens'),
        costInMillicents: sum(selectedEvaluationResults.costInMillicents).as(
          'cost_in_millicents',
        ),
        modalValue: sql<
          string | null
        >`MODE() WITHIN GROUP (ORDER BY ${selectedEvaluationResults.result})`.as(
          'modal_value',
        ),
      })
      .from(selectedEvaluationResults)
      .groupBy(selectedEvaluationResults.documentUuid)
      .as('aggregated_results')

    const modalValueCount = this.db.$with('modal_value_count').as(
      this.db
        .with(aggregatedResults, selectedEvaluationResults)
        .select({
          documentUuid: aggregatedResults.documentUuid,
          modalValueCount: count(selectedEvaluationResults.id).as(
            'modal_value_count',
          ),
        })
        .from(aggregatedResults)
        .innerJoin(
          selectedEvaluationResults,
          eq(
            aggregatedResults.documentUuid,
            selectedEvaluationResults.documentUuid,
          ),
        )
        .where(
          eq(selectedEvaluationResults.result, aggregatedResults.modalValue),
        )
        .groupBy(aggregatedResults.documentUuid),
    )

    const result = await this.db
      .with(connectedDocuments, aggregatedResults, modalValueCount)
      .select({
        ...connectedDocuments._.selectedFields,
        evaluationLogs:
          sql<number>`COALESCE(${aggregatedResults.evaluationLogs}, 0)`
            .mapWith(Number)
            .as('evaluation_logs'),
        totalTokens: sql<number>`COALESCE(${aggregatedResults.totalTokens}, 0)`
          .mapWith(Number)
          .as('total_tokens'),
        costInMillicents:
          sql<number>`COALESCE(${aggregatedResults.costInMillicents}, 0)`
            .mapWith(Number)
            .as('cost_in_millicents'),
        modalValue: sql<
          string | null
        >`COALESCE(${aggregatedResults.modalValue}, NULL)`.as('modal_value'),
        modalValueCount:
          sql<number>`COALESCE(${modalValueCount.modalValueCount}, 0)`
            .mapWith(Number)
            .as('modal_value_count'),
      })
      .from(connectedDocuments)
      .leftJoin(
        aggregatedResults,
        eq(connectedDocuments.documentUuid, aggregatedResults.documentUuid),
      )
      .leftJoin(
        modalValueCount,
        eq(connectedDocuments.documentUuid, modalValueCount.documentUuid),
      )

    return Result.ok(result)
  }
}
