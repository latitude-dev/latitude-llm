'use server'

import { markWorkspaceOnboardingComplete } from '@latitude-data/core/services/workspaceOnboarding/update'
import { getWorkspaceOnboarding } from '@latitude-data/core/services/workspaceOnboarding/get'
import { authProcedure } from '../procedures'
import { frontendRedirect } from '$/lib/frontendRedirect'
import { ROUTES } from '$/services/routes'
import { z } from 'zod'
import { isFeatureEnabledByName } from '@latitude-data/core/services/workspaceFeatures/isFeatureEnabledByName'
import { Result } from '@latitude-data/core/lib/Result'
import { RunSourceGroup } from '@latitude-data/core/constants'

/**
 * Mark onboarding as complete
 */
export const completeOnboardingAction = authProcedure
  .inputSchema(
    z.object({
      projectId: z.number(),
      commitUuid: z.string(),
      documentUuid: z.string().optional(),
      experimentUuids: z.array(z.string()).optional(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const { projectId, commitUuid, documentUuid, experimentUuids } = parsedInput
    const onboarding = await getWorkspaceOnboarding({
      workspace: ctx.workspace,
    }).then((r) => r.unwrap())

    await markWorkspaceOnboardingComplete({
      onboarding,
    }).then((r) => r.unwrap())

    const isExperimentsOnboarding = documentUuid && experimentUuids
    if (isExperimentsOnboarding) {
      return frontendRedirect(
        ROUTES.projects
          .detail({ id: projectId })
          .commits.detail({ uuid: commitUuid })
          .documents.detail({ uuid: documentUuid })
          .experiments.withSelected(experimentUuids),
      )
    }

    const isDatasetOnboardingEnabledResult = await isFeatureEnabledByName(
      ctx.workspace.id,
      'datasetOnboarding',
    )

    if (!Result.isOk(isDatasetOnboardingEnabledResult)) {
      return frontendRedirect(ROUTES.dashboard.root)
    }
    const isDatasetOnboardingEnabled = isDatasetOnboardingEnabledResult.unwrap()

    if (isDatasetOnboardingEnabled) {
      return frontendRedirect(
        ROUTES.projects
          .detail({ id: projectId })
          .commits.detail({ uuid: commitUuid })
          .runs.root({
            sourceGroup: RunSourceGroup.Playground,
          }),
      )
    }

    // Default redirect to the project's home page
    return frontendRedirect(
      ROUTES.projects
        .detail({ id: projectId })
        .commits.detail({ uuid: commitUuid }).home.root,
    )
  })
