import {
  CommitsRepository,
  EvaluationResultsV2Repository,
  IssuesRepository,
} from '../../repositories'
import { Workspace } from '../../schema/models/types/Workspace'
import { Commit } from '../../schema/models/types/Commit'
import {
  MINIMUM_NEGATIVE_ANNOTATIONS_FOR_THIS_ISSUE,
  MINIMUM_POSITIVE_OR_OTHER_NEGATIVE_ANNOTATIONS_FOR_OTHER_ISSUES,
} from '@latitude-data/constants/issues'

/*
To be able to generate an evaluation, we need enough annotations to do a minimally good MCC (Matthews Correlation Coefficient) %.
The reason we used MCC is because it's a good metric to measure the alignment of the evaluation for a binary classification of the selected issue.
We've decided we need, at least:
- 5 negative annotations for this issue
- 5 positive or other negative annotations for other issues of the same document
Like this, we have enough annotations to calculate the true positive (TP), true negative (TN), false positive (FP) and false negative (FN) to calculate the MCC %.

IMPORTANT:
- The evaluation results MUST be from HITL evaluation results, as we want to use the user's annotations to calculate the MCC, not from other evaluations results
*/
export async function getEvaluationResultsToGenerateEvaluationForIssue({
  workspace,
  projectId,
  commitUuid,
  issueId,
}: {
  workspace: Workspace
  projectId: number
  commitUuid: string
  issueId: number
}) {
  const commitsRepo = new CommitsRepository(workspace.id)
  const commit = await commitsRepo
    .getCommitByUuid({
      projectId,
      uuid: commitUuid,
    })
    .then((r) => r.unwrap())

  const { passedEvaluationResults, negativeAnnotationsOfThisIssue } =
    await getEvaluationResultsFromIssues({
      workspace,
      commit,
      issueId,
    })

  return {
    passedEvaluationResults,
    negativeAnnotationsOfThisIssue,
  }
}

/*
  We need to get also the positive or other negative annotations of other issues of the same document
  As the minimum number of positive/other issue annotations is 5, we need to get at least 5 other issues to calculate the MCC of the generated evaluation (6 just in case one of the 5 is the same as the issue we're checking)
*/
const getEvaluationResultsFromIssues = async ({
  workspace,
  commit,
  issueId,
}: {
  workspace: Workspace
  commit: Commit
  issueId: number
}) => {
  const resultsRepository = new EvaluationResultsV2Repository(workspace.id)
  const issueRepository = new IssuesRepository(workspace.id)
  const issue = await issueRepository.find(issueId).then((r) => r.unwrap())
  const { results: negativeAnnotationsOfThisIssue } =
    await resultsRepository.fetchPaginatedHITLResultsByIssue({
      workspace,
      commit,
      issue,
      page: 1,
      pageSize: MINIMUM_NEGATIVE_ANNOTATIONS_FOR_THIS_ISSUE + 1,
    })

  const { results: passedEvaluationResults } =
    await resultsRepository.fetchPaginatedHITLResultsByDocument({
      workspace,
      commit,
      documentUuid: issue.documentUuid,
      excludeIssueId: issueId,
      page: 1,
      pageSize:
        MINIMUM_POSITIVE_OR_OTHER_NEGATIVE_ANNOTATIONS_FOR_OTHER_ISSUES + 1,
    })

  return {
    passedEvaluationResults: passedEvaluationResults.length,
    negativeAnnotationsOfThisIssue: negativeAnnotationsOfThisIssue.length,
  }
}
