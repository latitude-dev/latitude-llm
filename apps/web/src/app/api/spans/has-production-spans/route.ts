import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { hasProductionTraces } from '@latitude-data/core/data-access/traces/hasProductionTraces'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const searchParamsSchema = z.object({
  projectId: z.coerce.number(),
})

export const GET = errorHandler(
  authHandler(
    async (request: NextRequest, { workspace }: { workspace: Workspace }) => {
      const searchParams = request.nextUrl.searchParams
      const { projectId } = searchParamsSchema.parse({
        projectId: searchParams.get('projectId'),
      })

      const hasTraces = await hasProductionTraces({
        workspaceId: workspace.id,
        projectId,
      })

      return NextResponse.json({ hasProductionSpans: hasTraces }, { status: 200 })
    },
  ),
)
