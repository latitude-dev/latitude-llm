import type { ToolCall } from '@latitude-data/compiler'
import type { PromptSource, Workspace } from '../../../../../browser'
import type { ResolvedTools } from '../../resolveTools/types'
import type { createMcpClientManager } from '../../../../../services/integrations/McpClient/McpClientManager'
import type { ChainStreamManager } from '../..'

export type ToolResponsesArgs = {
  workspace: Workspace
  promptSource: PromptSource
  resolvedTools: ResolvedTools
  toolCalls: ToolCall[]
  mcpClientManager?: ReturnType<typeof createMcpClientManager>
  chainStreamManager?: ChainStreamManager
}
