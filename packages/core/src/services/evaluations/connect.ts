import {
  ConnectedEvaluation,
  EvaluationMode,
  SafeWorkspace,
  Workspace,
} from '../../browser'
import { database } from '../../client'
import {
  NotFoundError,
  PromisedResult,
  Result,
  Transaction,
  TypedResult,
} from '../../lib'
import {
  DocumentVersionsRepository,
  EvaluationsRepository,
} from '../../repositories'
import { connectedEvaluations } from '../../schema'
import { importLlmAsJudgeEvaluation } from './create'

export function connectEvaluations(
  {
    workspace,
    documentUuid,
    evaluationUuids,
    templateIds,
    evaluationMode = EvaluationMode.Batch,
  }: {
    workspace: Workspace | SafeWorkspace
    documentUuid: string
    evaluationUuids?: string[]
    templateIds?: number[]
    evaluationMode?: EvaluationMode
  },
  db = database,
): PromisedResult<ConnectedEvaluation[], Error> {
  return Transaction.call(
    async (tx): PromisedResult<ConnectedEvaluation[], Error> => {
      const documentVersionsScope = new DocumentVersionsRepository(
        workspace.id,
        tx,
      )
      const documentExists =
        await documentVersionsScope.existsDocumentWithUuid(documentUuid)
      if (!documentExists) {
        return Result.error(new NotFoundError('Document not found'))
      }

      // TODO: Creating an evaluation is kind of a pita because of the
      // polymorphic relation with metadata so we use the creation service which
      // causes N db operations (not ideal). Implement a bulkCreate of
      // evaluations service.
      const importedEvaluations = await Promise.all(
        templateIds?.map((templateId) =>
          importLlmAsJudgeEvaluation({ workspace, templateId }, tx),
        ) ?? [],
      )

      const error = Result.findError(importedEvaluations)
      if (error) return error as TypedResult<ConnectedEvaluation[], Error>

      const evaluationsScope = new EvaluationsRepository(workspace.id, tx)
      const selectedEvaluations = await evaluationsScope.filterByUuids(
        evaluationUuids ?? [],
      )
      if (selectedEvaluations.error) return selectedEvaluations
      if (selectedEvaluations.value.length !== evaluationUuids?.length) {
        const missingEvaluationUuids = evaluationUuids?.filter(
          (uuid) => !selectedEvaluations.value.some((r) => r.uuid === uuid),
        )
        return Result.error(
          new NotFoundError(
            `The following evaluations were not found: ${missingEvaluationUuids?.join(', ')}`,
          ),
        )
      }

      const allEvaluationIds = [
        ...selectedEvaluations.unwrap().map((r) => r.id),
        ...importedEvaluations.map((r) => r.unwrap().id),
      ]

      if (!allEvaluationIds.length) return Result.ok([])

      const rezults = await tx
        .insert(connectedEvaluations)
        .values(
          allEvaluationIds.map((evaluationId) => ({
            evaluationMode,
            documentUuid,
            evaluationId,
          })),
        )
        .returning()

      return Result.ok(rezults)
    },
    db,
  )
}
