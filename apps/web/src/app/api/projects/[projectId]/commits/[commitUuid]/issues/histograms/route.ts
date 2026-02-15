import { z } from 'zod'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { findHistogramsForIssues } from '@latitude-data/core/queries/issueHistograms/findHistogramsForIssues'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { NextRequest, NextResponse } from 'next/server'

export type HistogramBatchResponse = Awaited<
  ReturnType<typeof findHistogramsForIssues>
>
const paramsSchema = z.object({
  projectId: z.coerce.number(),
  commitUuid: z.string(),
})

const querySchema = z.object({
  issueIds: z
    .string()
    .transform((val) => val.split(',').map((id) => Number(id.trim())))
    .pipe(z.array(z.number()).min(1)),
})

export const GET = errorHandler(
  authHandler(
    async (
      request: NextRequest,
      {
        params,
        workspace,
      }: {
        params: {
          projectId: string
          commitUuid: string
        }
        workspace: Workspace
      },
    ) => {
      const { projectId, commitUuid } = paramsSchema.parse({
        projectId: params.projectId,
        commitUuid: params.commitUuid,
      })

      const query = request.nextUrl.searchParams
      const { issueIds } = querySchema.parse({
        issueIds: query.get('issueIds') ?? '',
      })

      const histogramData = await findHistogramsForIssues({
        workspaceId: workspace.id,
        issueIds,
        commitUuid,
        projectId,
      })

      return NextResponse.json(histogramData, { status: 200 })
    },
  ),
)
