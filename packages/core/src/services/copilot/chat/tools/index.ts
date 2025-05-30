import {
  ContentType,
  MessageRole,
  type ToolCall,
  type ToolMessage,
} from '@latitude-data/compiler'
import { Workspace } from '../../../../browser'
import { PromisedResult } from '../../../../lib/Transaction'
import { Result } from '../../../../lib/Result'
import type { LatteToolFn } from './types'
import { LatteTool } from '@latitude-data/constants/latte'

import listPrompts from './documents/list'
import readPrompt from './documents/read'
import listProjects from './projects/list'

const LATTE_TOOLS: Record<LatteTool, LatteToolFn<any>> = {
  [LatteTool.listProjects]: listProjects,
  [LatteTool.listPrompts]: listPrompts,
  [LatteTool.readPrompt]: readPrompt,
} as const

export async function handleToolRequest({
  workspace,
  tool,
  onFinish,
}: {
  workspace: Workspace
  tool: ToolCall
  onFinish?: (toolMessage: ToolMessage) => Promise<void>
}): PromisedResult<ToolMessage> {
  const toolName = tool.name as LatteTool
  const latteTool = LATTE_TOOLS[toolName]
  if (!latteTool) {
    return Result.error(
      new Error(`Tool '${toolName}' is not supported in this environment.`),
    )
  }

  const result = await latteTool({
    workspace,
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
