import {
  CommitsRepository,
  EvaluationResultsV2Repository,
} from '../../repositories'
import { Workspace } from '../../schema/models/types/Workspace'
import { Commit } from '../../schema/models/types/Commit'
import {
  MINIMUM_NEGATIVE_ANNOTATIONS_FOR_THIS_ISSUE,
  MINIMUM_POSITIVE_OR_OTHER_NEGATIVE_ANNOTATIONS_FOR_OTHER_ISSUES,
} from '@latitude-data/constants/issues'
import { findIssue } from './findById'

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
  const issue = await findIssue({ workspaceId: workspace.id, id: issueId })
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
