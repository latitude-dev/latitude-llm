'use server'

import { authProcedure } from '../procedures'
import { calculateAllSteps } from '@latitude-data/core/services/workspaceOnboarding/steps/calculateAllSteps'

/**
 * Calculate all steps for the onboarding
 */
export const calculateNavbarStepsAction = authProcedure.action(
  async ({ ctx }) => {
    return await calculateAllSteps({
      workspace: ctx.workspace,
    }).then((r) => r.unwrap())
  },
)
