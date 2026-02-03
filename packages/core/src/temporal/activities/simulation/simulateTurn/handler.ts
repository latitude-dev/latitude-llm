import { Context } from '@temporalio/activity'
import { LogSources } from '@latitude-data/constants'
import { Message } from '@latitude-data/constants/messages'
import { unsafelyFindWorkspace } from '../../../../data-access/workspaces'
import { NotFoundError } from '../../../../lib/errors'
import { Result } from '../../../../lib/Result'
import { addMessages } from '../../../../services/addMessages'
import { generateSimulatedUserAction } from '../../../../services/simulation/simulateUserResponse'

export type SimulateTurnResult = {
  action: 'end' | 'respond'
  messages: Message[]
}

export async function simulateTurnActivityHandler({
  workspaceId,
  documentLogUuid,
  messages,
  currentTurn,
  maxTurns,
}: {
  workspaceId: number
  documentLogUuid: string
  messages: Message[]
  currentTurn: number
  maxTurns: number
}): Promise<SimulateTurnResult> {
  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) {
    throw new NotFoundError(`Workspace not found: ${workspaceId}`)
  }

  Context.current().heartbeat(`Turn ${currentTurn}/${maxTurns}`)

  const userActionResult = await generateSimulatedUserAction({
    messages,
    simulationInstructions: undefined,
    currentTurn,
    maxTurns,
  })

  if (!Result.isOk(userActionResult)) {
    throw userActionResult.error
  }

  const userAction = userActionResult.value

  if (userAction.action === 'end') {
    return { action: 'end', messages }
  }

  const addMessagesResult = await addMessages({
    workspace,
    documentLogUuid,
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: userAction.message }],
      },
    ],
    source: LogSources.API,
    tools: {},
  })

  if (!Result.isOk(addMessagesResult)) {
    throw addMessagesResult.error
  }

  const result = addMessagesResult.unwrap()
  const updatedMessages = await result.messages

  return {
    action: 'respond',
    messages: updatedMessages,
  }
}
