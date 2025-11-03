'use server'

import { markWorkspaceOnboardingComplete } from '@latitude-data/core/services/workspaceOnboarding/update'
import { getWorkspaceOnboarding } from '@latitude-data/core/services/workspaceOnboarding/get'
import { authProcedure } from '../procedures'
import { frontendRedirect } from '$/lib/frontendRedirect'
import { ROUTES } from '$/services/routes'
import { z } from 'zod'
import { RunSourceGroup } from '@latitude-data/constants'

/**
 * Mark onboarding as complete
 */
export const completeOnboardingAction = authProcedure
  .inputSchema(
    z.object({
      projectId: z.number(),
      commitUuid: z.string(),
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

    return frontendRedirect(
      ROUTES.projects
        .detail({ id: projectId })
        .commits.detail({ uuid: commitUuid })
        .runs.root({
          sourceGroup: RunSourceGroup.Playground,
        }),
    )
  })
