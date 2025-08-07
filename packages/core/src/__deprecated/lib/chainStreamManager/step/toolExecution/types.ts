import { ToolCall } from '@latitude-data/compiler'
import { ChainStreamManager } from '../..'
import { PromptSource, Workspace } from '../../../../../browser'
import { createMcpClientManager } from '../../../../../services/integrations/McpClient/McpClientManager'
import { TelemetryContext } from '../../../../../telemetry'
import { ResolvedTools } from '../../resolveTools/types'

export type ToolResponsesArgs = {
  contexts: TelemetryContext[]
  workspace: Workspace
  promptSource: PromptSource
  resolvedTools: ResolvedTools
  toolCalls: ToolCall[]
  mcpClientManager?: ReturnType<typeof createMcpClientManager>
  chainStreamManager?: ChainStreamManager
}
