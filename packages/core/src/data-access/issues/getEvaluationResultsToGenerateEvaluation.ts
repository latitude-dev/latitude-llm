import {
  CommitsRepository,
  EvaluationResultsV2Repository,
  IssuesRepository,
  ProjectsRepository,
} from '@latitude-data/core/repositories'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { Project } from '../../schema/models/types/Project'
import { Commit } from '../../schema/models/types/Commit'

/*
To be able to generate an evaluation, we need enough annotations to do a minimally good MCC (Matthews Correlation Coefficient) %.
The reason we used MCC is because it's a good metric to measure the quality of the evaluation for a binary classification of the selected issue.
We've decided we need, at least:
- 5 negative annotations for this issue
- 5 positive or other negative annotations for other issues of the same document
Like this, we have enough annotations to calculate the true positive (TP), true negative (TN), false positive (FP) and false negative (FN) to calculate the MCC %.
*/
export async function getEvaluationResultsToGenerateEvaluationForIssue({
  workspace,
  projectId,
  commitUuid,
  issueId,
  documentUuid,
}: {
  workspace: Workspace
  projectId: number
  commitUuid: string
  issueId: number
  documentUuid: string
}) {
  const projectsRepo = new ProjectsRepository(workspace.id)
  const project = await projectsRepo.find(projectId).then((r) => r.unwrap())
  const commitsRepo = new CommitsRepository(workspace.id)
  const commit = await commitsRepo
    .getCommitByUuid({
      projectId,
      uuid: commitUuid,
    })
    .then((r) => r.unwrap())

  const resultsRepository = new EvaluationResultsV2Repository(workspace.id)
  const evaluationResults = await getEvaluationResultsFromIssues({
    workspace,
    project,
    commit,
    documentUuid,
    issueId,
    resultsRepository,
  })

  const negativeAnnotationsOfThisIssue =
    evaluationResults.failedEvaluationResultsByIssueId[issueId].filter(
      (r) => r.hasPassed === false,
    ).length

  let negativeAnnotationsOfOtherIssues = 0
  for (const otherIssueId in evaluationResults.failedEvaluationResultsByIssueId) {
    if (Number(otherIssueId) === issueId) continue
    negativeAnnotationsOfOtherIssues +=
      evaluationResults.failedEvaluationResultsByIssueId[otherIssueId].length
  }

  const positiveAndNegativeAnnotationsOfOtherIssues =
    negativeAnnotationsOfOtherIssues +
    evaluationResults.passedEvaluationResults.length

  return {
    negativeAnnotationsOfThisIssue,
    positiveAndNegativeAnnotationsOfOtherIssues,
  }
}

const getEvaluationResultsFromIssues = async ({
  workspace,
  project,
  commit,
  documentUuid,
  issueId,
  resultsRepository,
}: {
  workspace: Workspace
  project: Project
  commit: Commit
  documentUuid: string
  issueId: number
  resultsRepository: EvaluationResultsV2Repository
}) => {
  // We need to get also the positive or other negative annotations of other issues of the same document
  // As the minimum number of positive/other issue annotations is 5, we need to get at least 5 other issues to calculate the MCC of the generated evaluation (6 just in case one of the 5 is the same as the issue we're checking)
  const issuesRepo = new IssuesRepository(workspace.id)
  const issuesFromSameDocument = await issuesRepo
    .fetchIssuesFiltered({
      project,
      commit,
      filters: {
        documentUuid,
      },
      sorting: {
        sort: 'relevance',
        sortDirection: 'desc',
      },
      page: 1,
      limit: 6,
    })
    .then((r) => r.unwrap())

  const failedEvaluationResultsByIssueId =
    await resultsRepository.listByIssueIdsGrouped([
      issueId,
      ...issuesFromSameDocument.issues.map((i) => i.id),
    ])

  const passedEvaluationResults =
    await resultsRepository.listPassedByDocumentUuid(documentUuid)

  return {
    passedEvaluationResults,
    failedEvaluationResultsByIssueId,
  }
}
