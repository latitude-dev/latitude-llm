import { getWorkspaceOnboarding } from '@latitude-data/core/services/workspaceOnboarding/get'
import { NextRequest, NextResponse } from 'next/server'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { WorkspaceDto } from '@latitude-data/core/schema/models/types/Workspace'

export const GET = errorHandler(
  authHandler(
    async (_: NextRequest, { workspace }: { workspace: WorkspaceDto }) => {
      try {
        const onboarding = await getWorkspaceOnboarding({
          workspace,
        }).then((r) => r.unwrap())

        return NextResponse.json({
          id: onboarding.id,
          workspaceId: onboarding.workspaceId,
          completed: !!onboarding.completedAt,
        })
      } catch (error) {
        console.error('Error fetching onboarding status:', error)
        return NextResponse.json(
          { error: 'Failed to fetch onboarding status' },
          { status: 500 },
        )
      }
    },
  ),
)
