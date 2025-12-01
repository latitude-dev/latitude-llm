import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { Issue } from '@latitude-data/core/schema/models/types/Issue'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { createValidationFlow } from './createEvaluationFlow'
import { Result } from '@latitude-data/core/lib/Result'
import { generateEvaluationFromIssueWithCopilot } from './generateFromIssue'

export async function generateEvaluationFromIssue({
  issue,
  workspace,
  commit,
  providerName,
  model,
  evaluationUuid,
}: {
  issue: Issue
  workspace: Workspace
  commit: Commit
  providerName: string
  model: string
  evaluationUuid: string
}) {
  const evaluationResult = await generateEvaluationFromIssueWithCopilot({
    issue,
    commit,
    workspace,
    providerName,
    model,
    evaluationUuid,
  })
  if (!Result.isOk(evaluationResult)) {
    return evaluationResult
  }
  const { evaluation } = evaluationResult.unwrap()

  const validationFlowResult = await createValidationFlow({
    workspace,
    commit,
    evaluationToEvaluate: evaluation,
    issue,
  })

  if (!Result.isOk(validationFlowResult)) {
    return validationFlowResult
  }

  const validationFlowJob = validationFlowResult.unwrap()

  return Result.ok({ validationFlowJob })
}
