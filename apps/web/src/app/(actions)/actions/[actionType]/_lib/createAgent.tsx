import { PlaygroundAction } from '$/hooks/usePlaygroundAction'
import {
  type ActionType,
  createAgentActionFrontendParametersSchema,
} from '@latitude-data/core/browser'
import type { ActionExecuteArgs } from './shared'

export const CreateAgentActionSpecification = {
  parameters: createAgentActionFrontendParametersSchema,
  execute: execute,
}

async function execute({
  parameters: { prompt, projectId, commitUuid },
  setPlaygroundAction,
}: ActionExecuteArgs<ActionType.CreateAgent>) {
  return setPlaygroundAction({
    action: PlaygroundAction.RunLatte,
    payload: { prompt: prompt },
    project: { id: projectId },
    commit: { uuid: commitUuid },
  })
}
