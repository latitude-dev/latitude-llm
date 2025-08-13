import { ROUTES } from '$/services/routes'
import {
  ActionType,
  cloneAgentActionFrontendParametersSchema,
} from '@latitude-data/core/browser'
import { ActionExecuteArgs } from './shared'

export const CloneAgentActionSpecification = {
  parameters: cloneAgentActionFrontendParametersSchema,
  execute: execute,
}

async function execute({
  parameters: { projectId, commitUuid },
  router,
}: ActionExecuteArgs<ActionType.CloneAgent>) {
  return router.push(
    ROUTES.projects
      .detail({ id: projectId })
      .commits.detail({ uuid: commitUuid }).preview.root,
  )
}
