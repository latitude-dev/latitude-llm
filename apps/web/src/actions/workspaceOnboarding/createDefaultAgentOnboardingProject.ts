'use server'

import { getWorkspaceOnboarding } from '@latitude-data/core/services/workspaceOnboarding/get'
import { markWorkspaceOnboardingComplete } from '@latitude-data/core/services/workspaceOnboarding/update'
import { authProcedure } from '../procedures'
import { frontendRedirect } from '$/lib/frontendRedirect'
import { envClient } from '$/envClient'
import { ROUTES } from '$/services/routes'

export const createDefaultAgentOnboardingProjectAction = authProcedure.action(
  async ({ ctx }) => {
    const { workspace } = ctx

    const onboarding = await getWorkspaceOnboarding({
      workspace,
    }).then((r) => r.unwrap())

    // We will mark the onboarding as complete so once the user clones the agent, they will be redirected to the home page
    await markWorkspaceOnboardingComplete({
      onboarding,
    }).then((r) => r.unwrap())

    if (!envClient.NEXT_PUBLIC_DEFAULT_AGENT_ONBOARDING_UUID) {
      return frontendRedirect(ROUTES.dashboard.root)
    }

    return frontendRedirect(
      ROUTES.actions.cloneAgent.withUuid(
        envClient.NEXT_PUBLIC_DEFAULT_AGENT_ONBOARDING_UUID,
      ),
    )
  },
)
