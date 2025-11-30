import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { Issue } from '@latitude-data/core/schema/models/types/Issue'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { createEvaluationFlow } from './createEvaluationFlow'
import { Result } from '@latitude-data/core/lib/Result'
import { getSpansByIssue } from '@latitude-data/core/data-access/issues/getSpansByIssue'
import { generateEvaluationFromIssueWithCopilot } from './generateFromIssue'
import { getSpansWithoutIssuesByDocumentUuid } from '../../../data-access/issues/getSpansWithoutIssuesByDocumentUuid'

const MAX_COMPARISON_ANNOTATIONS = 100

export async function generateEvaluationFromIssue({
  issue,
  workspace,
  commit,
  providerName,
  model,
}: {
  issue: Issue
  workspace: Workspace
  commit: Commit
  providerName: string
  model: string
}) {
  const evaluationResult = await generateEvaluationFromIssueWithCopilot({
    issue,
    commit,
    workspace,
    providerName,
    model,
  })
  if (!Result.isOk(evaluationResult)) {
    return evaluationResult
  }
  const { evaluation } = evaluationResult.unwrap()

  const spansResult =
    await getEqualAmountsOfPositiveAndNegativeEvaluationResults({
      workspace,
      commit,
      issue,
    })
  if (!Result.isOk(spansResult)) {
    return spansResult
  }
  const spans = spansResult.unwrap()

  const spanAndTraceIdPairsOfPositiveEvaluationRuns =
    spans.positiveEvaluationResults.map((span) => ({
      spanId: span.id,
      traceId: span.traceId,
    }))
  const spanAndTraceIdPairsOfNegativeEvaluationRuns =
    spans.negativeEvaluationResults.map((span) => ({
      spanId: span.id,
      traceId: span.traceId,
    }))
  const allSpans = [
    ...spans.positiveEvaluationResults,
    ...spans.negativeEvaluationResults,
  ]

  const createEvaluationFlowResult = await createEvaluationFlow({
    workspace,
    commit,
    evaluationToEvaluate: evaluation,
    spans: allSpans,
    spanAndTraceIdPairsOfPositiveEvaluationRuns,
    spanAndTraceIdPairsOfNegativeEvaluationRuns,
  })

  if (!Result.isOk(createEvaluationFlowResult)) {
    return createEvaluationFlowResult
  }

  const { job } = createEvaluationFlowResult.unwrap()

  return Result.ok({ job })
}

/*
Gets:
- the spans of the issue (positive evalResults)
- the spans of the other issues of the same document or the thumbs up evalResults of that document (negative evalResults)

Thumbs up evalResults of the same document or evalResults of other issues of the same document count as negative evalResults because
 they are cases in which the new evaluation should return a negative result, as that span doesnt have that issue
*/
async function getEqualAmountsOfPositiveAndNegativeEvaluationResults({
  workspace,
  commit,
  issue,
}: {
  workspace: Workspace
  commit: Commit
  issue: Issue
}) {
  const spansResult = await getSpansByIssue({
    workspace,
    commit,
    issue,
    pageSize: MAX_COMPARISON_ANNOTATIONS,
    page: 1,
  })
  if (!Result.isOk(spansResult)) {
    return spansResult
  }
  const { spans } = spansResult.unwrap()

  // Getting the same amount of negative evaluation results spans as the positive evaluation results spans
  const spansWithoutIssuesResult = await getSpansWithoutIssuesByDocumentUuid({
    workspace,
    commit,
    documentUuid: issue.documentUuid,
    pageSize: spans.length,
    page: 1,
  })
  if (!Result.isOk(spansWithoutIssuesResult)) {
    return spansWithoutIssuesResult
  }
  const { spans: spansWithoutIssues } = spansWithoutIssuesResult.unwrap()

  const targetLength = Math.min(spans.length, spansWithoutIssues.length)
  return Result.ok({
    positiveEvaluationResults: spans.slice(0, targetLength),
    negativeEvaluationResults: spansWithoutIssues.slice(0, targetLength),
  })
}

export const __test__ = {
  getEqualAmountsOfPositiveAndNegativeEvaluationResults,
}
