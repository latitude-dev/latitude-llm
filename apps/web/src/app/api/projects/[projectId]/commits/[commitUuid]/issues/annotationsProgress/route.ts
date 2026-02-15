import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { getAnnotationsProgress } from '@latitude-data/core/queries/issues/getAnnotationsProgress'
import { OkType } from '@latitude-data/core/lib/Result'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export type AnnotationsProgressResponse = Awaited<
  OkType<typeof getAnnotationsProgress>
>
const paramsSchema = z.object({
  projectId: z.coerce.number(),
  commitUuid: z.string(),
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
        }
        workspace: Workspace
      },
    ) => {
      const { projectId, commitUuid } = paramsSchema.parse({
        projectId: params.projectId,
        commitUuid: params.commitUuid,
      })

      const progress = await getAnnotationsProgress({
        workspace,
        projectId,
        commitUuid,
      }).then((r) => r.unwrap())

      return NextResponse.json(progress, { status: 200 })
    },
  ),
)
