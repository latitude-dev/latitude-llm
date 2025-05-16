import { LatteSuggestion, LatteTool } from '@latitude-data/constants/latte'
import { ErrorResult, Result } from '../../../../../lib/Result'
import { PromisedResult } from '../../../../../lib/Transaction'
import { CopilotTool } from '../types'
import { ToolCall } from '@latitude-data/compiler'
import { BadRequestError, LatitudeError } from '../../../../../lib/errors'
import { listDocumentsAndSuggestions } from '../helpers'

const addSuggestion: CopilotTool<{ suggestions: LatteSuggestion[] }> = async (
  _,
  { websockets, workspace, commit, chatUuid, messages, toolCall },
): PromisedResult<LatteSuggestion[]> => {
  // Check if this tool was requested more than once in this chat. If so, return an error for any request other than the first one.
  const lastMessageToolCalls = (messages.at(-1)?.toolCalls as ToolCall[]) ?? []
  const addSuggestionCalls = lastMessageToolCalls.filter(
    (toolCall) => toolCall.name === LatteTool.addSuggestions,
  )
  if (addSuggestionCalls.length > 1) {
    const currentCallIndex = addSuggestionCalls.findIndex(
      (call) => call.id === toolCall.id,
    )
    if (currentCallIndex > 0) {
      return Result.error(
        new BadRequestError(
          `This tool can only be requested once at a time. To add multiple suggestions, you must include them all in the same request.`,
        ),
      )
    }
  }

  const listResult = await listDocumentsAndSuggestions({
    workspace,
    commit,
    messages,
  })

  if (!listResult.ok) return listResult as ErrorResult<LatitudeError>
  const { suggestions: updatedSuggestions } = listResult.unwrap()

  // Send update to the chat with the new suggestions
  websockets.emit('copilotChatSuggestions', {
    workspaceId: workspace.id,
    data: {
      chatUuid,
      suggestions: updatedSuggestions,
    },
  })

  return Result.ok(updatedSuggestions)
}

export default addSuggestion
