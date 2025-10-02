import { ROUTES } from '$/services/routes'
import { ActionExecuteArgs } from './shared'
import type { ActionType } from '@latitude-data/constants/actions'
import { cloneAgentActionFrontendParametersSchema } from '@latitude-data/core/constants'

export const CloneAgentActionSpecification = {
  parameters: cloneAgentActionFrontendParametersSchema,
  execute: execute,
}

async function execute({
  parameters: { projectId, commitUuid, hasCompletedOnboarding },
  router,
}: ActionExecuteArgs<typeof ActionType.CloneAgent>) {
  if (!hasCompletedOnboarding) {
    return router.push(ROUTES.onboarding.root)
  }

  return router.push(
    ROUTES.projects
      .detail({ id: projectId })
      .commits.detail({ uuid: commitUuid }).preview.root,
  )
}
