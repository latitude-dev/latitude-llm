import { ROUTES } from '$/services/routes'
import type { ActionType } from '@latitude-data/constants/actions'
import { cloneAgentActionFrontendParametersSchema } from '@latitude-data/core/constants'
import { ActionExecuteArgs } from './shared'

export const CloneAgentActionSpecification = {
  parameters: cloneAgentActionFrontendParametersSchema,
  execute: execute,
}

async function execute({
  parameters: { projectId, commitUuid, hasCompletedOnboarding },
  router,
}: ActionExecuteArgs<ActionType.CloneAgent>) {
  if (!hasCompletedOnboarding) {
    return router.push(ROUTES.onboarding.agents)
  }

  return router.push(
    ROUTES.projects
      .detail({ id: projectId })
      .commits.detail({ uuid: commitUuid }).preview.root,
  )
}
