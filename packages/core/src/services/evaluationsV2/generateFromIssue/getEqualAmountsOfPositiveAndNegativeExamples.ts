import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { Result } from '@latitude-data/core/lib/Result'
import { Issue } from '../../../schema/models/types/Issue'
import { getHITLSpansByIssue } from '../../../data-access/issues/getHITLSpansByIssue'
import { getHITLSpansByDocument } from '../../../data-access/issues/getHITLSpansByDocument'
import { database } from '../../../client'

const MAX_COMPARISON_ANNOTATIONS = 100

/*
Gets:
- the spans of the issue that were annotated by the user (HITL evaluation results) (examples that should fail the evaluation)
- the spans of the other issues of the same document or the thumbs up evalResults of that document that were annotated by the user (HITL evaluation results) (examples that should pass the evaluation)

IMPORTANT: 
- The evaluation MUST fail when the issue is present in the span, as this logic is used within the issue discovery and its how we want our end goal to be.
  We want the evaluations to be like unit tests, where if all of them pass for a given trace of a document, that means that the trace has no issues, that its good!
- The spans MUST be from HITL evaluation results only, as we want to use ONLY the user's annotations to calculate the MCC, not from other evaluations results.

Thumbs up evalResults of the same document or evalResults of other issues of the same document count as negative evalResults because
 they are cases in which the new evaluation should return a positive result, as that span doesnt have that issue (its good!).
*/
export async function getEqualAmountsOfPositiveAndNegativeExamples(
  {
    workspace,
    commit,
    issue,
  }: {
    workspace: Workspace
    commit: Commit
    issue: Issue
  },
  db = database,
) {
  const examplesThatShouldFailTheEvaluationResult = await getHITLSpansByIssue(
    {
      workspace,
      commit,
      issue,
      pageSize: MAX_COMPARISON_ANNOTATIONS,
      page: 1,
    },
    db,
  )
  if (!Result.isOk(examplesThatShouldFailTheEvaluationResult)) {
    return examplesThatShouldFailTheEvaluationResult
  }
  const { spans: examplesThatShouldFailTheEvaluation } =
    examplesThatShouldFailTheEvaluationResult.unwrap()

  // Getting the same amount of examples that should pass the evaluation, as we need an equal amount of both to calculate correctly the MCC
  const examplesThatShouldPassTheEvaluationResult =
    await getHITLSpansByDocument(
      {
        workspace,
        commit,
        documentUuid: issue.documentUuid,
        pageSize: examplesThatShouldFailTheEvaluation.length,
        excludeIssueId: issue.id,
        page: 1,
      },
      db,
    )
  if (!Result.isOk(examplesThatShouldPassTheEvaluationResult)) {
    return examplesThatShouldPassTheEvaluationResult
  }
  const { spans: examplesThatShouldPassTheEvaluation } =
    examplesThatShouldPassTheEvaluationResult.unwrap()

  const targetLength = Math.min(
    examplesThatShouldFailTheEvaluation.length,
    examplesThatShouldPassTheEvaluation.length,
  )

  return Result.ok({
    examplesThatShouldPassTheEvaluationSliced:
      examplesThatShouldPassTheEvaluation.slice(0, targetLength),
    examplesThatShouldFailTheEvaluationSliced:
      examplesThatShouldFailTheEvaluation.slice(0, targetLength),
  })
}
