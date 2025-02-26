import { ToolCall } from '@latitude-data/compiler'
import { PromptSource, Workspace } from '../../../../browser'
import { ResolvedTools } from '../../resolveTools/types'

export type ToolResponsesArgs = {
  workspace: Workspace
  promptSource: PromptSource
  resolvedTools: ResolvedTools
  toolCalls: ToolCall[]
}
