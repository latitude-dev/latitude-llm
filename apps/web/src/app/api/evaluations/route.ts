import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { HEAD_COMMIT } from '@latitude-data/constants'
import { EvaluationsV2Repository } from '@latitude-data/core/repositories'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { WorkspacePermissions } from '@latitude-data/core/permissions/workspace'

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
        commitUuid: commitUuidParam,
        documentUuid,
      } = searchParamsSchema.parse({
        projectId: searchParams.get('projectId') ?? undefined,
        commitUuid: searchParams.get('commitUuid') ?? undefined,
        documentUuid: searchParams.get('documentUuid') ?? undefined,
      })

      const projectId = projectIdParam ? Number(projectIdParam) : undefined
      const commitUuid = commitUuidParam || HEAD_COMMIT

      const repository = new EvaluationsV2Repository(workspace.id)
      const evaluations = documentUuid
        ? await repository
            .listAtCommitByDocument({ projectId, commitUuid, documentUuid })
            .then((r) => r.unwrap())
        : await repository
            .listAtCommit({ projectId, commitUuid })
            .then((r) => r.unwrap())

      return NextResponse.json(evaluations, { status: 200 })
    },
    WorkspacePermissions.AccessAnnotations,
  ),
)
