import { NextResponse } from 'next/server'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { listActiveEvaluations } from '@latitude-data/core/services/evaluationsV2/active/listActive'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { NextRequest } from 'next/server'

export const GET = errorHandler(
  authHandler(
    async (
      _: NextRequest,
      {
        params,
        workspace,
      }: {
        params: {
          projectId: number
        }
        workspace: Workspace
      },
    ) => {
      const { projectId } = params

      const activeEvaluations = await listActiveEvaluations({
        workspaceId: workspace.id,
        projectId,
      }).then((r) => r.unwrap())

      return NextResponse.json(activeEvaluations, { status: 200 })
    },
  ),
)
