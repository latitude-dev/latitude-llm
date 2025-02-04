import { ConnectedEvaluation, User, Workspace } from '../../browser'
import { database } from '../../client'
import { publisher } from '../../events/publisher'
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
  ProjectsRepository,
} from '../../repositories'
import { connectedEvaluations } from '../../schema'
import { pingProjectUpdate } from '../projects'
import { importLlmAsJudgeEvaluation } from './create'

export function connectEvaluations(
  {
    workspace,
    documentUuid,
    evaluationUuids,
    templateIds,
    user,
    live = false,
  }: {
    workspace: Workspace
    documentUuid: string
    evaluationUuids?: string[]
    templateIds?: number[]
    user: User
    live?: boolean
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

      const projectsScope = new ProjectsRepository(workspace.id, tx)
      const project = await projectsScope
        .getProjectByDocumentUuid(documentUuid)
        .then((r) => r.unwrap())

      await pingProjectUpdate({ projectId: project.id }, tx)

      // TODO: Creating an evaluation is kind of a pita because of the
      // polymorphic relation with metadata so we use the creation service which
      // causes N db operations (not ideal). Implement a bulkCreate of
      // evaluations service.
      const importedEvaluations = await Promise.all(
        templateIds?.map((templateId) =>
          importLlmAsJudgeEvaluation({ workspace, user, templateId }, tx),
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
            documentUuid,
            evaluationId,
            live,
          })),
        )
        .returning()

      publisher.publishLater({
        type: 'evaluationsConnected',
        data: {
          evaluations: rezults,
          userEmail: user.email,
          workspaceId: workspace.id,
        },
      })

      return Result.ok(rezults)
    },
    db,
  )
}
