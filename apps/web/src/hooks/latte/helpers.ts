import type { ToolCall } from '@latitude-data/compiler'
import { LatteTool } from '@latitude-data/constants/latte'
import { LatteToolStep } from './types'

export function getDescriptionFromToolCall(
  toolCall: ToolCall,
): Partial<LatteToolStep> {
  const name = toolCall.name as LatteTool
  const params = toolCall.arguments

  switch (name) {
    case LatteTool.listProjects:
      return {
        activeDescription: `Listing projects`,
        finishedDescription: `Listed projects`,
      }

    case LatteTool.listPrompts:
      return {
        activeDescription: `Listing prompts`,
        finishedDescription: `Listed prompts`,
      }

    case LatteTool.readPrompt:
      return {
        activeDescription: `Reading prompt ${params.path}`,
        finishedDescription: `Read prompt ${params.path}`,
      }

    case 'lat_agent_ask_documentation' as LatteTool: // Documentation subagent
      return {
        activeDescription: `Searching '${params.question}'`,
        finishedDescription: `Searched '${params.question}'`,
        customIcon: 'bookMarked',
      }

    default:
      return {
        activeDescription: name,
      }
  }
}
