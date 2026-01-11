import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { EvaluationResultsV2Repository } from '@latitude-data/core/repositories'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { WorkspacePermissions } from '@latitude-data/core/permissions/workspace'

const searchParamsSchema = z.object({
  traceIds: z.string().optional(),
  projectId: z.string().optional(),
  commitUuid: z.string().optional(),
  documentUuid: z.string().optional(),
})

export const GET = errorHandler(
  authHandler(
    async (request: NextRequest, { workspace }: { workspace: Workspace }) => {
      const searchParams = request.nextUrl.searchParams
      const { traceIds } = searchParamsSchema.parse({
        traceIds: searchParams.get('traceIds') ?? undefined,
        projectId: searchParams.get('projectId') ?? undefined,
        commitUuid: searchParams.get('commitUuid') ?? undefined,
        documentUuid: searchParams.get('documentUuid') ?? undefined,
      })

      const traceIdList = traceIds?.split(',') || []
      const resultsRepository = new EvaluationResultsV2Repository(workspace.id)
      const results = await resultsRepository
        .listByTraceIds(traceIdList)
        .then((r) => r.unwrap())

      return NextResponse.json(results, { status: 200 })
    },
    WorkspacePermissions.AccessAnnotations,
  ),
)
