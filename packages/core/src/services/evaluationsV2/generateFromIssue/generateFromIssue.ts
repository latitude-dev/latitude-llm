import { getSpanMessagesAndEvaluationResultsByIssue } from '@latitude-data/core/data-access/issues/getSpanMessagesAndEvaluationResultsByIssue'
import { BadRequestError } from '@latitude-data/core/lib/errors'
import { Result } from '@latitude-data/core/lib/Result'
import {
  CommitsRepository,
  EvaluationResultsV2Repository,
  EvaluationsV2Repository,
  SpansRepository,
} from '@latitude-data/core/repositories'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { Issue } from '@latitude-data/core/schema/models/types/Issue'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { assertCopilotIsSupported } from '@latitude-data/core/services/copilot/assertItsSupported'
import { env } from '@latitude-data/env'
import z from 'zod'
import { database } from '../../../client'
import {
  CLOUD_MESSAGES,
  EvaluationV2,
  LlmEvaluationBinarySpecification,
} from '../../../constants'
import { getSpanMessagesByIssueDocument } from '../../../data-access/issues/getSpanMessagesByIssueDocument'
import {
  buildSpanMessagesWithReasons,
  SpanMessagesWithReason,
} from '../../spans/buildSpanMessagesWithReasons'
import { runCopilot } from '../../copilot'

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
    falsePositivesSpanAndTraceIdPairs,
    falseNegativesSpanAndTraceIdPairs,
    previousEvaluationConfiguration,
  }: {
    issue: Issue
    commit: Commit
    workspace: Workspace
    providerName: string
    model: string
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

  // Get the existing evaluation names for the same commit and document to avoid generating evals with the same name (unique key)
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

  const existingEvaluationNames = existingEvaluations.map((e) => e.name)

  // Getting failed examples (evaluation results with the issue attached) to feed the copilot
  const messagesAndReasonWhyFailedForIssueResult =
    await getSpanMessagesAndEvaluationResultsByIssue({
      workspace: workspace,
      commit: commit,
      issue: issue,
      existingEvaluations,
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

  let falsePositiveExamples: SpanMessagesWithReason[] = []
  if (falsePositivesSpanAndTraceIdPairs) {
    const falsePositiveExamplesResult = await getSpansFromSpanAndTraceIdPairs({
      workspace,
      commit,
      spanAndTraceIdPairs: falsePositivesSpanAndTraceIdPairs,
      evaluations: existingEvaluations,
    })
    if (!Result.isOk(falsePositiveExamplesResult)) {
      return falsePositiveExamplesResult
    }
    falsePositiveExamples = falsePositiveExamplesResult.unwrap()
  }

  let falseNegativeExamples: SpanMessagesWithReason[] = []
  if (falseNegativesSpanAndTraceIdPairs) {
    const falseNegativeExamplesResult = await getSpansFromSpanAndTraceIdPairs({
      workspace,
      commit,
      spanAndTraceIdPairs: falseNegativesSpanAndTraceIdPairs,
      evaluations: existingEvaluations,
    })
    if (!Result.isOk(falseNegativeExamplesResult)) {
      return falseNegativeExamplesResult
    }
    falseNegativeExamples = falseNegativeExamplesResult.unwrap()
  }

  const evaluationConfigResult = await runCopilot({
    path: env.COPILOT_PROMPT_ISSUE_EVALUATION_GENERATOR_PATH,
    parameters: {
      issueName: issue.title,
      issueDescription: issue.description,
      existingEvaluationNames: existingEvaluationNames,
      examplesWithIssue: messagesAndReasonWhyFailedForIssue,
      goodExamplesWithoutIssue: passedExampleMessagesFromIssueDocument,
      falsePositiveExamples,
      falseNegativeExamples,
      previousEvaluationConfiguration,
    },
    schema: llmEvaluationBinarySpecificationWithoutModel,
    db,
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

export async function getSpansFromSpanAndTraceIdPairs({
  spanAndTraceIdPairs,
  workspace,
  commit,
  evaluations,
}: {
  spanAndTraceIdPairs: {
    spanId: string
    traceId: string
  }[]
  workspace: Workspace
  commit: Commit
  evaluations: EvaluationV2[]
}) {
  const spanRepository = new SpansRepository(workspace.id)
  const spansResult =
    await spanRepository.findBySpanAndTraceIds(spanAndTraceIdPairs)
  if (!Result.isOk(spansResult)) {
    return spansResult
  }
  const spans = spansResult.unwrap()

  const evaluationResultsRepository = new EvaluationResultsV2Repository(
    workspace.id,
  )
  const commitsRepo = new CommitsRepository(workspace.id)
  const commitHistory = await commitsRepo.getCommitsHistory({ commit })
  const commitHistoryIds = commitHistory.map((c) => c.id)

  const evaluationUuids = evaluations.map((e) => e.uuid)
  const evaluationResults =
    await evaluationResultsRepository.listBySpanAndEvaluations({
      spans,
      evaluationUuids,
      commitHistoryIds,
    })

  return buildSpanMessagesWithReasons({
    workspace,
    spans,
    evaluationResults,
    evaluations,
  })
}

export const __test__ = {
  llmEvaluationBinarySpecificationWithoutModel,
}
