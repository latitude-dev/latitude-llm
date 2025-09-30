import { getWorkspaceOnboarding } from '@latitude-data/core/services/workspaceOnboarding/get'
import { NextRequest, NextResponse } from 'next/server'
import { authHandler } from '$/middlewares/authHandler'
import { WorkspaceDto } from '@latitude-data/core/browser'
import { errorHandler } from '$/middlewares/errorHandler'
import { OnboardingStepKey } from '@latitude-data/constants/onboardingSteps'
import { Result } from '@latitude-data/core/lib/Result'

export const GET = errorHandler(
  authHandler(
    async (_: NextRequest, { workspace }: { workspace: WorkspaceDto }) => {
      try {
        const onboardingResult = await getWorkspaceOnboarding({
          workspace,
        })

        if (!Result.isOk(onboardingResult)) {
          return NextResponse.json({
            currentStep: OnboardingStepKey.SetupIntegrations,
            completed: false,
          })
        }

        const onboarding = onboardingResult.unwrap()

        return NextResponse.json({
          id: onboarding.id,
          workspaceId: onboarding.workspaceId,
          completed: !!onboarding.completedAt,
          currentStep: onboarding.currentStep,
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
