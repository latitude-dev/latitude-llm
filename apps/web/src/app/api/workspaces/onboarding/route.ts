import { getWorkspaceOnboarding } from '@latitude-data/core/services/workspaceOnboarding/get'
import { type NextRequest, NextResponse } from 'next/server'
import { authHandler } from '$/middlewares/authHandler'
import type { WorkspaceDto } from '@latitude-data/core/browser'
import { errorHandler } from '$/middlewares/errorHandler'

export const GET = errorHandler(
  authHandler(async (_: NextRequest, { workspace }: { workspace: WorkspaceDto }) => {
    try {
      const result = await getWorkspaceOnboarding({
        workspace,
      })

      if (result.error) {
        return NextResponse.json({
          currentStep: 1,
          completed: false,
        })
      }

      const onboarding = result.value

      return NextResponse.json({
        id: onboarding.id,
        workspaceId: onboarding.workspaceId,
        completed: !!onboarding.completedAt,
      })
    } catch (error) {
      console.error('Error fetching onboarding status:', error)
      return NextResponse.json({ error: 'Failed to fetch onboarding status' }, { status: 500 })
    }
  }),
)
