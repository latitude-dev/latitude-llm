import { computeWorkspaceUsage } from '@latitude-data/core/services/workspaces/usage'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import { WorkspaceDto } from '@latitude-data/core/schema/models/types/Workspace'

export const GET = errorHandler(
  authHandler(
    async (
      _req: NextRequest,
      {
        workspace,
      }: {
        workspace: WorkspaceDto
      },
    ) => {
      const usage = await computeWorkspaceUsage({
        id: workspace.id,
        currentSubscriptionCreatedAt: workspace.currentSubscription.createdAt,
        plan: workspace.currentSubscription.plan,
      }).then((r) => r.unwrap())

      return NextResponse.json(usage)
    },
  ),
)
