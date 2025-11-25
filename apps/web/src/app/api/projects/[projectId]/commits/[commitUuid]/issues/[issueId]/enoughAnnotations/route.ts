import { z } from 'zod'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { NextRequest, NextResponse } from 'next/server'
import { getEvaluationResultsToGenerateEvaluationForIssue } from '@latitude-data/core/data-access/issues/getEvaluationResultsToGenerateEvaluation'

const paramsSchema = z.object({
  projectId: z.coerce.number(),
  commitUuid: z.string(),
  issueId: z.coerce.number(),
  documentUuid: z.string(),
})

export type IssueEvaluationStats = {
  issueId: number
  negativeAnnotationsOfThisIssue: number
  positiveAndNegativeAnnotationsOfOtherIssues: number
}

export const GET = errorHandler(
  authHandler(
    async (
      request: NextRequest,
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
      const { projectId, commitUuid, issueId, documentUuid } =
        paramsSchema.parse({
          projectId: params.projectId,
          commitUuid: params.commitUuid,
          issueId: params.issueId,
          documentUuid: request.nextUrl.searchParams.get('documentUuid'),
        })
      const enoughAnnotationNumbers =
        await getEvaluationResultsToGenerateEvaluationForIssue({
          workspace,
          projectId,
          commitUuid,
          issueId,
          documentUuid,
        })

      return NextResponse.json(
        {
          issueId,
          negativeAnnotationsOfThisIssue:
            enoughAnnotationNumbers.negativeAnnotationsOfThisIssue,
          positiveAndNegativeAnnotationsOfOtherIssues:
            enoughAnnotationNumbers.positiveAndNegativeAnnotationsOfOtherIssues,
        },
        { status: 200 },
      )
    },
  ),
)
