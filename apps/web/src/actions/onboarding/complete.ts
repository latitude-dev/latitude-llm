'use server'

import { markUserOnboardingComplete } from '@latitude-data/core/services/users/completeOnboarding'
import { authProcedure } from '../procedures'
import { frontendRedirect } from '$/lib/frontendRedirect'
import { ROUTES } from '$/services/routes'
import { z } from 'zod'
import { RunSourceGroup } from '@latitude-data/constants'

export const completeOnboardingAction = authProcedure
  .inputSchema(
    z.object({
      projectId: z.number(),
      commitUuid: z.string(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const { projectId, commitUuid } = parsedInput

    await markUserOnboardingComplete({
      user: ctx.user,
    }).then((r) => r.unwrap())

    return frontendRedirect(
      ROUTES.projects
        .detail({ id: projectId })
        .commits.detail({ uuid: commitUuid })
        .annotations.root({
          sourceGroup: RunSourceGroup.Playground,
          realtime: true,
        }),
    )
  })

