import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { EvaluationsV2Repository } from '@latitude-data/core/repositories'
import { NextRequest, NextResponse } from 'next/server'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { z } from 'zod'
import { HEAD_COMMIT } from '@latitude-data/constants'

const searchParamsSchema = z.object({
  projectId: z.string().optional(),
  commitUuid: z.string().optional(),
  documentUuid: z.string().optional(),
})

export const GET = errorHandler(
  authHandler(
    async (request: NextRequest, { workspace }: { workspace: Workspace }) => {
      const searchParams = request.nextUrl.searchParams
      const {
        projectId: projectIdParam,
        commitUuid,
        documentUuid,
      } = searchParamsSchema.parse({
        projectId: searchParams.get('projectId') ?? undefined,
        commitUuid: searchParams.get('commitUuid') ?? undefined,
        documentUuid: searchParams.get('documentUuid') ?? undefined,
      })

      const evaluationsRepository = new EvaluationsV2Repository(workspace.id)
      const evaluations = await evaluationsRepository
        .list({
          projectId: projectIdParam ? Number(projectIdParam) : undefined,
          commitUuid: commitUuid || HEAD_COMMIT,
          documentUuid,
        })
        .then((r) => r.unwrap())

      return NextResponse.json(evaluations, { status: 200 })
    },
  ),
)
