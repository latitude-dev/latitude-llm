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
    falsePositivesSpanAndTraceIdPairs,
    falseNegativesSpanAndTraceIdPairs,
    previousEvaluationConfiguration,
  }: {
    issue: Issue
    workspace: Workspace
    commit: Commit
    providerName: string
    model: string
    workflowUuid: string
    generationAttempt: number
    falsePositivesSpanAndTraceIdPairs?: {
      spanId: string
      traceId: string
    }[]
    falseNegativesSpanAndTraceIdPairs?: {
      spanId: string
      traceId: string
    }[]
    previousEvaluationConfiguration?: {
      criteria: string
      passDescription: string
      failDescription: string
    }
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
      falsePositivesSpanAndTraceIdPairs,
      falseNegativesSpanAndTraceIdPairs,
      previousEvaluationConfiguration,
    })

  if (!Result.isOk(evaluationConfigResult)) {
    return evaluationConfigResult
  }
  const evaluationConfig = evaluationConfigResult.unwrap()

  // Adding a transaction here as we want to ensure that if there is an error after the creation of the evaluation, we rollback the created evaluation
  // The validation flow cant be rolled back (its BullMQ), but the idempotency key will prevent the flow being created twice
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

    return await createValidationFlow(
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
      tx,
    )
  })
}
