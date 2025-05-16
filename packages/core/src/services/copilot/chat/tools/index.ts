import {
  ContentType,
  Message,
  MessageRole,
  type ToolCall,
  type ToolMessage,
} from '@latitude-data/compiler'
import { Commit, Project, Workspace } from '../../../../browser'
import { PromisedResult } from '../../../../lib/Transaction'
import { Result } from '../../../../lib/Result'
import type { CopilotTool } from './types'

import { LatteTool } from '@latitude-data/constants/latte'
import listPrompts from './documents/list'
import listCommitChanges from './commit/list_changes'
import readPrompt from './documents/read'
import addSuggestion from './suggestions/add'
import { WorkerSocket } from '../../../../websockets/workers'

const COPILOT_TOOLS: Record<LatteTool, CopilotTool<any>> = {
  [LatteTool.listPrompts]: listPrompts,
  [LatteTool.readPrompt]: readPrompt,
  [LatteTool.listCommitChanges]: listCommitChanges,
  [LatteTool.addSuggestions]: addSuggestion,
} as const

export async function handleToolRequest({
  websockets,
  workspace,
  project,
  commit,
  chatUuid,
  messages,
  tool,
  onFinish,
}: {
  websockets: WorkerSocket
  workspace: Workspace
  project: Project
  commit: Commit
  messages: Message[]
  chatUuid: string
  tool: ToolCall
  onFinish?: (toolMessage: ToolMessage) => Promise<void>
}): PromisedResult<ToolMessage> {
  const toolName = tool.name as LatteTool
  const copilotTool = COPILOT_TOOLS[toolName]
  if (!copilotTool) {
    return Result.error(
      new Error(`Tool '${toolName}' is not supported in this environment.`),
    )
  }

  let result
  try {
    result = await copilotTool(tool.arguments, {
      workspace,
      project,
      commit,
      chatUuid,
      messages,
      toolCall: tool,
      websockets,
    })
  } catch (error) {
    result = Result.error(error as Error)
  }

  const resultMessage: ToolMessage = {
    role: MessageRole.tool,
    content: [
      {
        type: ContentType.toolResult,
        toolCallId: tool.id,
        toolName: toolName,
        result: result.ok ? result.value : result.error,
        isError: !result.ok,
      },
    ],
  }

  await onFinish?.(resultMessage)
  return Result.ok(resultMessage)
}
