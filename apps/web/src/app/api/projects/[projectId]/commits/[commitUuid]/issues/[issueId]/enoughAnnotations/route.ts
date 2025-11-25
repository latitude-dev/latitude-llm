import { z } from 'zod'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import {
  CommitsRepository,
  EvaluationResultsV2Repository,
  IssuesRepository,
  ProjectsRepository,
} from '@latitude-data/core/repositories'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { NextRequest, NextResponse } from 'next/server'

const paramsSchema = z.object({
  projectId: z.coerce.number(),
  commitUuid: z.string(),
  issueId: z.coerce.number(),
})

export type IssueEvaluationStats = {
  issueId: number
  negativeAnnotationsOfThisIssue: number
  positiveOrOtherNegativeAnnotationsOfOtherIssues: number
  hasEnoughAnnotations: boolean
}

export const GET = errorHandler(
  authHandler(
    async (
      _: NextRequest,
      {
        workspace,
        params,
      }: {
        workspace: Workspace
        params: {
          projectId: string
          commitUuid: string
          issueId: string
        }
      },
    ): Promise<NextResponse<IssueEvaluationStats>> => {
      const { projectId, commitUuid, issueId } = paramsSchema.parse({
        projectId: params.projectId,
        commitUuid: params.commitUuid,
        issueId: params.issueId,
      })
      const projectsRepo = new ProjectsRepository(workspace.id)
      const project = await projectsRepo.find(projectId).then((r) => r.unwrap())
      const commitsRepo = new CommitsRepository(workspace.id)
      const commit = await commitsRepo
        .getCommitByUuid({
          projectId,
          uuid: commitUuid,
        })
        .then((r) => r.unwrap())

      // We need to get at least 5 other issues to calculate the MCC of the generated evaluation
      const issuesRepo = new IssuesRepository(workspace.id)
      const issues = await issuesRepo
        .fetchIssuesFiltered({
          project,
          commit,
          filters: {},
          sorting: {
            sort: 'relevance',
            sortDirection: 'desc',
          },
          page: 1,
          limit: 6,
        })
        .then((r) => r.unwrap())

      const resultsRepository = new EvaluationResultsV2Repository(workspace.id)
      const results = await resultsRepository
        .listByIssueIds([issueId, ...issues.issues.map((i) => i.id)])
        .then((r) => r.unwrap())

      const negativeAnnotationsOfThisIssue = results.filter(
        (r) => r.issueId === issueId && r.hasPassed === false,
      ).length
      const positiveOrOtherNegativeAnnotationsOfOtherIssues = results.filter(
        (r) => r.issueId !== issueId,
      ).length

      // We currently require at least 5 negative annotations for this issue and 5 positive/other issues annotations to calculate the MCC of the generated evaluation
      const hasEnoughAnnotations =
        negativeAnnotationsOfThisIssue >= 5 &&
        positiveOrOtherNegativeAnnotationsOfOtherIssues >= 5

      return NextResponse.json(
        {
          issueId,
          negativeAnnotationsOfThisIssue,
          positiveOrOtherNegativeAnnotationsOfOtherIssues,
          hasEnoughAnnotations,
        },
        { status: 200 },
      )
    },
  ),
)
