'use server'

import { markWorkspaceOnboardingComplete } from '@latitude-data/core/services/workspaceOnboarding/update'
import { getWorkspaceOnboarding } from '@latitude-data/core/services/workspaceOnboarding/get'
import { authProcedure } from '../procedures'
import { frontendRedirect } from '$/lib/frontendRedirect'
import { ROUTES } from '$/services/routes'
import { z } from 'zod'

/**
 * Mark onboarding as complete
 */
export const completeOnboardingAction = authProcedure
  .inputSchema(
    z.object({
      projectId: z.number().optional(),
      commitUuid: z.string().optional(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const { projectId, commitUuid } = parsedInput
    const onboarding = await getWorkspaceOnboarding({
      workspace: ctx.workspace,
    }).then((r) => r.unwrap())

    await markWorkspaceOnboardingComplete({
      onboarding,
    }).then((r) => r.unwrap())

    if (!projectId || !commitUuid) {
      return frontendRedirect(ROUTES.dashboard.root)
    }

    return frontendRedirect(
      ROUTES.projects
        .detail({ id: projectId })
        .commits.detail({ uuid: commitUuid }).preview.root,
    )
  })
