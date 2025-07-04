import {
  Message,
  MessageRole,
  type ToolCall,
  type ToolMessage,
} from '@latitude-data/constants/legacyCompiler'
import { LatteTool } from '@latitude-data/constants/latte'
import { Workspace } from '../../../../browser'
import { Result, TypedResult } from '../../../../lib/Result'
import { PromisedResult } from '../../../../lib/Transaction'
import { telemetry, TelemetryContext } from '../../../../telemetry'
import type { LatteToolFn } from './types'

import listDrafts from './commits/list'
import listPrompts from './documents/list'
import readPrompt from './documents/read'
import editProject from './projects/edit'
import listProjects from './projects/list'
import listIntegrations from './settings/listIntegrations'
import listIntegrationTools from './settings/listIntegrationTools'
import listProviders from './settings/listProviders'

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
  context,
  tool,
  threadUuid,
  workspace,
  messages,
  onFinish,
}: {
  context: TelemetryContext
  tool: ToolCall
  threadUuid: string
  messages: Message[]
  workspace: Workspace
  onFinish?: (toolMessage: ToolMessage) => Promise<void>
}): PromisedResult<ToolMessage> {
  const $tool = telemetry.tool(context, {
    name: tool.name,
    call: {
      id: tool.id,
      arguments: tool.arguments,
    },
  })

  const toolName = tool.name as LatteTool
  const latteTool = LATTE_TOOLS[toolName]
  let result: TypedResult<unknown, Error>

  if (!latteTool) {
    result = Result.error(
      new Error(`Tool '${toolName}' is not supported in this environment.`),
    )
  } else {
    try {
      result = await latteTool(tool.arguments, {
        context: $tool.context,
        threadUuid,
        workspace,
        tool,
        messages,
      })
    } catch (error) {
      result = Result.error(error as Error)
    }
  }

  const message: ToolMessage = {
    role: MessageRole.tool,
    content: [
      {
        type: 'tool-result',
        toolCallId: tool.id,
        toolName: toolName,
        result: result.ok
          ? result.value
          : `${result.error!.name}: ${result.error!.message}`,
        isError: !result.ok,
      },
    ],
  }

  $tool.end({
    result: {
      value: result.value ?? result.error,
      isError: !result.ok,
    },
  })

  await onFinish?.(message)
  return Result.ok(message)
}
