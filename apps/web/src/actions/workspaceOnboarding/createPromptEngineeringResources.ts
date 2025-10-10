'use server'

import { authProcedure } from '../procedures'
import { createOnboardingResources } from '@latitude-data/core/services/onboardingResources/create'
import { Result } from '@latitude-data/core/lib/Result'
import { frontendRedirect } from '$/lib/frontendRedirect'
import { ROUTES } from '$/services/routes'

export const createPromptEngineeringResourcesAction = authProcedure.action(
  async ({ ctx }) => {
    const { workspace, user } = ctx

    const onboardingResourcesResult = await createOnboardingResources({
      workspace,
      user,
    })
    if (!Result.isOk(onboardingResourcesResult)) {
      return onboardingResourcesResult
    }

    return frontendRedirect(ROUTES.onboarding.promptEngineering)
  },
)
