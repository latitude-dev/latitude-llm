import { ToolCall } from '@latitude-data/compiler'
import { PromptSource, Workspace } from '../../../../browser'
import { ResolvedTools } from '../../resolveTools/types'
import { createMcpClientManager } from '../../../../services/integrations/McpClient/McpClientManager'
import { ChainStreamManager } from '../..'
import { TelemetryContext } from '../../../../telemetry'

export type ToolResponsesArgs = {
  contexts: TelemetryContext[]
  workspace: Workspace
  promptSource: PromptSource
  resolvedTools: ResolvedTools
  toolCalls: ToolCall[]
  mcpClientManager?: ReturnType<typeof createMcpClientManager>
  chainStreamManager?: ChainStreamManager
}
