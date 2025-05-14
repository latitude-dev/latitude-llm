import {
  ContentType,
  MessageRole,
  type ToolCall,
  type ToolMessage,
} from '@latitude-data/compiler'
import { Commit, Project, Workspace } from '../../../../browser'
import { PromisedResult } from '../../../../lib/Transaction'
import { Result } from '../../../../lib/Result'
import type { CopilotTool } from './types'

import listPrompts from './documents/list'
import listCommitChanges from './commit/list_changes'
import readPrompt from './documents/read'
import { LatteTool } from '@latitude-data/constants/latte'

const COPILOT_TOOLS: Record<LatteTool, CopilotTool<any>> = {
  [LatteTool.listPrompts]: listPrompts,
  [LatteTool.readPrompt]: readPrompt,
  [LatteTool.listCommitChanges]: listCommitChanges,
} as const

export async function handleToolRequest({
  workspace,
  project,
  commit,
  tool,
  onFinish,
}: {
  workspace: Workspace
  project: Project
  commit: Commit
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

  const result = await copilotTool({
    workspace,
    project,
    commit,
    parameters: tool.arguments,
  })

  const message: ToolMessage = {
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

  await onFinish?.(message)
  return Result.ok(message)
}
