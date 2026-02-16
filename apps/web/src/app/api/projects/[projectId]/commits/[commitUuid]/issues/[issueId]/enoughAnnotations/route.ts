import { z } from 'zod'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { NextRequest, NextResponse } from 'next/server'
import { getEvaluationResultsToGenerateEvaluationForIssue } from '@latitude-data/core/queries/issues/getEvaluationResultsToGenerateEvaluation'

const paramsSchema = z.object({
  projectId: z.coerce.number(),
  commitUuid: z.string(),
  issueId: z.coerce.number(),
})

export type IssueEvaluationStats = {
  issueId: number
  negativeAnnotationsOfThisIssue: number
  passedEvaluationResults: number
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
      const enoughAnnotationNumbers =
        await getEvaluationResultsToGenerateEvaluationForIssue({
          workspace,
          projectId,
          commitUuid,
          issueId,
        })

      return NextResponse.json(
        {
          issueId,
          negativeAnnotationsOfThisIssue:
            enoughAnnotationNumbers.negativeAnnotationsOfThisIssue,
          passedEvaluationResults:
            enoughAnnotationNumbers.passedEvaluationResults,
        },
        { status: 200 },
      )
    },
  ),
)
