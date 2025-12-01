import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import {
  DocumentVersionsRepository,
  EvaluationsV2Repository,
} from '@latitude-data/core/repositories'
import { Result } from '@latitude-data/core/lib/Result'
import {
  CLOUD_MESSAGES,
  EvaluationType,
  LlmEvaluationBinarySpecification,
  LlmEvaluationMetric,
} from '../../../constants'
import { env } from '@latitude-data/env'
import { database } from '@latitude-data/core/client'
import { getCopilot } from '../../copilot'
import { runCopilot } from '../../copilot'
import { Issue } from '@latitude-data/core/schema/models/types/Issue'
import { createEvaluationV2 } from '../create'
import { assertCopilotIsSupported } from '@latitude-data/core/services/copilot/assertItsSupported'
import z from 'zod'
import { BadRequestError } from '@latitude-data/core/lib/errors'
import { getSpanMessagesAndEvaluationResultsByIssue } from '@latitude-data/core/data-access/issues/getSpanMessagesAndEvaluationResultsByIssue'

const llmEvaluationBinarySpecificationWithoutModel =
  LlmEvaluationBinarySpecification.configuration
    .omit({
      model: true,
      provider: true,
      actualOutput: true,
    })
    .extend({
      name: z.string(),
      description: z.string(),
    })

/*
  This function generates an evaluation from an issue using the copilot.

  We give the copilot the issue name, description, prompt, existing evaluation names, and messages with reason why it failed
    to create a unique evaluation configuration with context from the issue and its annotations.
*/
export async function generateEvaluationFromIssueWithCopilot(
  {
    issue,
    workspace,
    commit,
    providerName,
    model,
    evaluationUuid,
  }: {
    issue: Issue
    commit: Commit
    workspace: Workspace
    providerName: string
    model: string
    evaluationUuid: string
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

  const documentRepository = new DocumentVersionsRepository(workspace.id)
  const document = await documentRepository
    .getDocumentAtCommit({
      commitUuid: commit.uuid,
      documentUuid: issue.documentUuid,
    })
    .then((r) => r.unwrap())

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

  const existingEvaluationNamesResult = await getExistingEvaluationNames({
    workspace: workspace,
    commit: commit,
    issue: issue,
  })

  if (!Result.isOk(existingEvaluationNamesResult)) {
    return existingEvaluationNamesResult
  }

  const existingEvaluationNames = existingEvaluationNamesResult.unwrap()

  //TODO (evaluation-generation): We can add a progress caption here as well if things are getting long and we want to know what is really happening.
  //TODO (evaluation-generation): We can find some passed results to give to the copilot to make it more accurate, but we would have to potentially summarize the messages to avoid many tokens
  const messagesAndEvaluationResultsResult =
    await getSpanMessagesAndEvaluationResultsByIssue({
      workspace: workspace,
      commit: commit,
      issue: issue,
    })

  if (!Result.isOk(messagesAndEvaluationResultsResult)) {
    return messagesAndEvaluationResultsResult
  }
  const messagesAndEvaluationResults =
    messagesAndEvaluationResultsResult.unwrap()

  const evaluationConfigResult = await runCopilot({
    copilot: copilot,
    parameters: {
      issueName: issue.title,
      issueDescription: issue.description,
      prompt: document.content,
      existingEvaluationNames: existingEvaluationNames,
      messagesWithReasonWhyItFailed: messagesAndEvaluationResults,
    },
    schema: llmEvaluationBinarySpecificationWithoutModel,
  })

  if (!Result.isOk(evaluationConfigResult)) {
    return evaluationConfigResult
  }

  const evaluationConfig = evaluationConfigResult.unwrap()

  const evaluationConfigWithProviderAndModel = {
    ...evaluationConfig,
    provider: providerName,
    model: model,
    actualOutput: {
      messageSelection: 'all' as const,
      parsingFormat: 'string' as const,
    },
  }
  // TODO(evaluation-generation): zod error popped in workers, but didnt show up in frontend??
  const evaluationResult = await createEvaluationV2({
    settings: {
      name: evaluationConfig.name,
      description: evaluationConfig.description,
      type: EvaluationType.Llm,
      metric: LlmEvaluationMetric.Binary,
      configuration: evaluationConfigWithProviderAndModel,
    },
    issueId: issue.id,
    document: document,
    workspace: workspace,
    commit: commit,
    evaluationUuid: evaluationUuid,
  })

  if (!Result.isOk(evaluationResult)) {
    return evaluationResult
  }

  return Result.ok(evaluationResult.unwrap())
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
