import {
  DocumentVersion,
  EvaluationDto,
  EvaluationMetadataType,
  EvaluationMode,
  EvaluationTemplateWithCategory,
} from '../../browser'
import { database } from '../../client'
import { findWorkspaceFromDocument } from '../../data-access'
import { findCommitById } from '../../data-access/commits'
import { ErrorResult, NotFoundError, Result, Transaction } from '../../lib'
import { connectedEvaluations } from '../../schema'
import { createEvaluation } from './create'

export function connectEvaluations(
  {
    document,
    templates,
    evaluations: evaluationToImport,
    evaluationMode = EvaluationMode.Batch,
  }: {
    document: DocumentVersion
    templates: EvaluationTemplateWithCategory[]
    evaluations: EvaluationDto[]
    evaluationMode?: EvaluationMode
  },
  db = database,
) {
  return Transaction.call(async (tx) => {
    const workspace = await findWorkspaceFromDocument(document, tx)
    if (!workspace) {
      return Result.error(new NotFoundError('Workspace not found'))
    }
    const commitResult = await findCommitById({ id: document.commitId }, tx)
    if (commitResult.error) {
      return Result.error(new NotFoundError('Commit not found'))
    }
    const commit = commitResult.unwrap()

    // TODO: Creating an evaluation is kind of a pita because of the
    // polymorphic relation with metadata so we use the creation service which
    // causes N db operations (not ideal). Implement a bulkCreate of
    // evaluations service.
    const results = await Promise.all(
      templates.map((template) =>
        createEvaluation(
          {
            workspace,
            name: template.name,
            description: template.description,
            type: EvaluationMetadataType.LlmAsJudge,
            metadata: {
              prompt: template.prompt,
            },
          },
          tx,
        ),
      ),
    )

    const error = Result.findError(results)
    if (error) return error as ErrorResult<Error>

    const evaluations = [
      ...evaluationToImport,
      ...results.map((r) => r.unwrap()),
    ]
    if (!evaluations.length) return Result.ok([])

    const rezults = await tx
      .insert(connectedEvaluations)
      .values(
        evaluations.map((evaluation) => ({
          evaluationMode,
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          evaluationId: evaluation.id,
        })),
      )
      .returning()

    return Result.ok(rezults)
  }, db)
}
