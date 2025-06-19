import {
  ContentType,
  Message,
  MessageRole,
  type ToolCall,
  type ToolMessage,
} from '@latitude-data/compiler'
import { Workspace } from '../../../../browser'
import { PromisedResult } from '../../../../lib/Transaction'
import { Result, TypedResult } from '../../../../lib/Result'
import { LatteTool } from '@latitude-data/constants/latte'
import type { LatteToolFn } from './types'

import listPrompts from './documents/list'
import readPrompt from './documents/read'
import listProjects from './projects/list'
import listDrafts from './commits/list'
import editProject from './projects/edit'
import listProviders from './settings/listProviders'
import listIntegrations from './settings/listIntegrations'
import listIntegrationTools from './settings/listIntegrationTools'

export const LATTE_TOOLS: Record<LatteTool, LatteToolFn<any>> = {
  [LatteTool.listProjects]: listProjects,
  [LatteTool.listDrafts]: listDrafts,
  [LatteTool.listPrompts]: listPrompts,
  [LatteTool.readPrompt]: readPrompt,
  [LatteTool.editProject]: editProject,
  [LatteTool.listProviders]: listProviders,
  [LatteTool.listIntegrations]: listIntegrations,
  [LatteTool.listIntegrationTools]: listIntegrationTools,
} as const

export async function handleToolRequest({
  tool,
  threadUuid,
  workspace,
  messages,
  onFinish,
}: {
  tool: ToolCall
  threadUuid: string
  messages: Message[]
  workspace: Workspace
  onFinish?: (toolMessage: ToolMessage) => Promise<void>
}): PromisedResult<ToolMessage> {
  const toolName = tool.name as LatteTool
  const latteTool = LATTE_TOOLS[toolName]
  if (!latteTool) {
    return Result.error(
      new Error(`Tool '${toolName}' is not supported in this environment.`),
    )
  }

  let result: TypedResult<unknown, Error>
  try {
    result = await latteTool(tool.arguments, {
      threadUuid,
      workspace,
      tool,
      messages,
    })
  } catch (error) {
    result = Result.error(error as Error)
  }

  const message: ToolMessage = {
    role: MessageRole.tool,
    content: [
      {
        type: ContentType.toolResult,
        toolCallId: tool.id,
        toolName: toolName,
        result: result.ok
          ? result.value
          : `${result.error!.name}: ${result.error!.message}`,
        isError: !result.ok,
      },
    ],
  }

  await onFinish?.(message)
  return Result.ok(message)
}
