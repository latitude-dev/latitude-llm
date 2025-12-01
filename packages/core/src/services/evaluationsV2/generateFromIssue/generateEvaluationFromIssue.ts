import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { Issue } from '@latitude-data/core/schema/models/types/Issue'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { createValidationFlow } from './createEvaluationFlow'
import { Result } from '@latitude-data/core/lib/Result'
import { generateEvaluationConfigFromIssueWithCopilot } from './generateFromIssue'
import Transaction from '../../../lib/Transaction'
import { updateActiveEvaluation } from '../active/update'
import { EvaluationType, LlmEvaluationMetric } from '../../../constants'
import { createEvaluationV2 } from '../create'
import { DocumentVersionsRepository } from '../../../repositories'

export async function generateEvaluationFromIssue(
  {
    issue,
    workspace,
    commit,
    providerName,
    model,
    workflowUuid,
    generationAttempt,
  }: {
    issue: Issue
    workspace: Workspace
    commit: Commit
    providerName: string
    model: string
    workflowUuid: string
    generationAttempt: number
  },
  transaction = new Transaction(),
) {
  const evaluationConfigResult =
    await generateEvaluationConfigFromIssueWithCopilot({
      issue,
      commit,
      workspace,
      providerName,
      model,
    })

  if (!Result.isOk(evaluationConfigResult)) {
    return evaluationConfigResult
  }
  const evaluationConfig = evaluationConfigResult.unwrap()

  return await transaction.call(async (tx) => {
    const documentRepository = new DocumentVersionsRepository(workspace.id, tx)
    const document = await documentRepository
      .getDocumentAtCommit({
        commitUuid: commit.uuid,
        documentUuid: issue.documentUuid,
      })
      .then((r) => r.unwrap())

    const evaluationResult = await createEvaluationV2(
      {
        settings: {
          name: evaluationConfig.name,
          description: evaluationConfig.description,
          type: EvaluationType.Llm,
          metric: LlmEvaluationMetric.Binary,
          configuration: evaluationConfig,
        },
        issueId: issue.id,
        document: document,
        workspace: workspace,
        commit: commit,
      },
      transaction,
    )

    if (!Result.isOk(evaluationResult)) {
      return evaluationResult
    }

    const { evaluation } = evaluationResult.unwrap()

    // Adding generated evaluation uuid to the active evaluation
    await updateActiveEvaluation({
      workspaceId: workspace.id,
      projectId: commit.projectId,
      workflowUuid,
      evaluationUuid: evaluation.uuid,
    })

    const validationFlowResult = await createValidationFlow(
      {
        generationAttempt,
        workspace,
        commit,
        workflowUuid,
        evaluationToEvaluate: evaluation,
        issue,
        providerName,
        model,
      },
      transaction,
    )

    if (!Result.isOk(validationFlowResult)) {
      return validationFlowResult
    }

    const validationFlowJob = validationFlowResult.unwrap()

    return Result.ok(validationFlowJob)
  })
}
