import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { EvaluationsV2Repository } from '@latitude-data/core/repositories'
import { Result } from '@latitude-data/core/lib/Result'
import {
  CLOUD_MESSAGES,
  LlmEvaluationBinarySpecification,
} from '../../../constants'
import { env } from '@latitude-data/env'
import { getCopilot } from '../../copilot'
import { runCopilot } from '../../copilot'
import { Issue } from '@latitude-data/core/schema/models/types/Issue'
import { assertCopilotIsSupported } from '@latitude-data/core/services/copilot/assertItsSupported'
import z from 'zod'
import { BadRequestError } from '@latitude-data/core/lib/errors'
import { getSpanMessagesAndEvaluationResultsByIssue } from '@latitude-data/core/data-access/issues/getSpanMessagesAndEvaluationResultsByIssue'
import { database } from '../../../client'
import { getSpanMessagesByIssueDocument } from '../../../data-access/issues/getSpanMessagesByIssueDocument'

const llmEvaluationBinarySpecificationWithoutModel =
  LlmEvaluationBinarySpecification.configuration
    .omit({
      model: true,
      provider: true,
      reverseScale: true,
      actualOutput: true,
    })
    .extend({
      name: z.string(),
      description: z.string(),
    })

/*
  This function generates the configuration for an evaluation from an issue using the copilot.
*/
export async function generateEvaluationConfigFromIssueWithCopilot(
  {
    issue,
    workspace,
    commit,
    providerName,
    model,
  }: {
    issue: Issue
    commit: Commit
    workspace: Workspace
    providerName: string
    model: string
  },
  db = database,
) {
  const assertResult = assertCopilotIsSupported(
    CLOUD_MESSAGES.generateEvaluationIssueUsingCopilot,
  )

  if (!env.COPILOT_PROMPT_ISSUE_EVALUATION_GENERATOR_PATH) {
    return Result.error(
      new BadRequestError(
        'COPILOT_PROMPT_ISSUE_EVALUATION_GENERATOR_PATH is not set',
      ),
    )
  }

  if (!Result.isOk(assertResult)) {
    return assertResult
  }

  const copilotResult = await getCopilot(
    {
      path: env.COPILOT_PROMPT_ISSUE_EVALUATION_GENERATOR_PATH,
    },
    db,
  )

  if (!Result.isOk(copilotResult)) {
    return copilotResult
  }

  const copilot = copilotResult.unwrap()

  // Get the existing evaluation names for the same commit and document to avoid generating evals with the same name (unique key)
  const existingEvaluationNamesResult = await getExistingEvaluationNames({
    workspace: workspace,
    commit: commit,
    issue: issue,
  })

  if (!Result.isOk(existingEvaluationNamesResult)) {
    return existingEvaluationNamesResult
  }

  const existingEvaluationNames = existingEvaluationNamesResult.unwrap()

  // Getting failed examples (evaluation results with the issue attached) to feed the copilot
  const messagesAndReasonWhyFailedForIssueResult =
    await getSpanMessagesAndEvaluationResultsByIssue({
      workspace: workspace,
      commit: commit,
      issue: issue,
    })

  if (!Result.isOk(messagesAndReasonWhyFailedForIssueResult)) {
    return messagesAndReasonWhyFailedForIssueResult
  }
  const messagesAndReasonWhyFailedForIssue =
    messagesAndReasonWhyFailedForIssueResult.unwrap()

  // Getting passed examples (passed evaluation results or failed about other issues of the same document) to feed the copilot
  const passedExampleMessagesFromIssueDocumentResult =
    await getSpanMessagesByIssueDocument({
      workspace: workspace,
      commit: commit,
      issue: issue,
    })

  if (!Result.isOk(passedExampleMessagesFromIssueDocumentResult)) {
    return passedExampleMessagesFromIssueDocumentResult
  }
  const passedExampleMessagesFromIssueDocument =
    passedExampleMessagesFromIssueDocumentResult.unwrap()

  const evaluationConfigResult = await runCopilot({
    copilot: copilot,
    parameters: {
      issueName: issue.title,
      issueDescription: issue.description,
      existingEvaluationNames: existingEvaluationNames,
      examplesWithIssueAndReasonWhy: messagesAndReasonWhyFailedForIssue,
      goodExamplesWithoutIssue: passedExampleMessagesFromIssueDocument,
    },
    schema: llmEvaluationBinarySpecificationWithoutModel,
  })

  if (!Result.isOk(evaluationConfigResult)) {
    return evaluationConfigResult
  }

  const evaluationConfig = evaluationConfigResult.unwrap()

  const evaluationConfigWithProviderAndModel = {
    ...evaluationConfig,
    reverseScale: false,
    provider: providerName,
    model: model,
    actualOutput: {
      messageSelection: 'all' as const,
      parsingFormat: 'string' as const,
    },
  }
  return Result.ok(evaluationConfigWithProviderAndModel)
}

async function getExistingEvaluationNames({
  workspace,
  commit,
  issue,
}: {
  workspace: Workspace
  commit: Commit
  issue: Issue
}) {
  const evaluationsRepository = new EvaluationsV2Repository(workspace.id)
  const evaluationsFromSameCommitAndDocumentResult =
    await evaluationsRepository.listAtCommitByDocument({
      projectId: commit.projectId,
      commitUuid: commit.uuid,
      documentUuid: issue.documentUuid,
    })
  if (!Result.isOk(evaluationsFromSameCommitAndDocumentResult)) {
    return evaluationsFromSameCommitAndDocumentResult
  }
  const existingEvaluations =
    evaluationsFromSameCommitAndDocumentResult.unwrap()

  return Result.ok(existingEvaluations.map((e) => e.name))
}

export const __test__ = {
  llmEvaluationBinarySpecificationWithoutModel,
}
