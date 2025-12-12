import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { EvaluationV2 } from '@latitude-data/core/constants'
import { EvaluationsV2Repository } from '@latitude-data/core/repositories/evaluationsV2Repository'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const paramsSchema = z.object({
  projectId: z.coerce.number(),
  commitUuid: z.string(),
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

      const documentUuids =
        request.nextUrl.searchParams
          .get('documentUuids')
          ?.split(',')
          .map((uuid) => uuid.trim())
          .filter((uuid) => uuid.length > 0) || []

      const evaluationsRepository = new EvaluationsV2Repository(workspace.id)
      let evaluations: EvaluationV2[] = []
      for (const documentUuid of documentUuids) {
        const evaluationsForDocument = await evaluationsRepository
          .list({
            projectId,
            commitUuid,
            documentUuid,
          })
          .then((r) => r.unwrap())
        evaluations = evaluations.concat(evaluationsForDocument)
      }

      return NextResponse.json(evaluations, { status: 200 })
    },
  ),
)
