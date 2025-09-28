import { PlaygroundAction } from '$/hooks/usePlaygroundAction'
import { ActionExecuteArgs } from './shared'
import type { ActionType } from '@latitude-data/core/schema/types'
import { createAgentActionFrontendParametersSchema } from '@latitude-data/core/constants'

export const CreateAgentActionSpecification = {
  parameters: createAgentActionFrontendParametersSchema,
  execute: execute,
}

async function execute({
  parameters: { prompt, projectId, commitUuid },
  setPlaygroundAction,
}: ActionExecuteArgs<typeof ActionType.CreateAgent>) {
  return setPlaygroundAction({
    action: PlaygroundAction.RunLatte,
    payload: { prompt: prompt },
    project: { id: projectId },
    commit: { uuid: commitUuid },
  })
}
