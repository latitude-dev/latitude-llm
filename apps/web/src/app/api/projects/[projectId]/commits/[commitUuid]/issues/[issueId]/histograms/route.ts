import { z } from 'zod'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { findHistogramForIssue } from '@latitude-data/core/queries/issueHistograms/findHistogramForIssue'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { NextRequest, NextResponse } from 'next/server'

export type MiniHistogramResponse = Awaited<
  ReturnType<typeof findHistogramForIssue>
>

const paramsSchema = z.object({
  projectId: z.coerce.number(),
  commitUuid: z.string(),
  issueId: z.coerce.number(),
})

export const GET = errorHandler(
  authHandler(
    async (
      _request: NextRequest,
      {
        params,
        workspace,
      }: {
        params: {
          projectId: string
          commitUuid: string
          issueId: string
        }
        workspace: Workspace
      },
    ) => {
      const { projectId, commitUuid, issueId } = paramsSchema.parse({
        projectId: params.projectId,
        commitUuid: params.commitUuid,
        issueId: params.issueId,
      })

      const histogramData = await findHistogramForIssue({
        workspaceId: workspace.id,
        issueId,
        commitUuid,
        projectId,
      })

      return NextResponse.json(histogramData, { status: 200 })
    },
  ),
)
