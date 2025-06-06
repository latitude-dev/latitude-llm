import type { ToolCall } from '@latitude-data/compiler'
import { LatteTool } from '@latitude-data/constants/latte'

export function getDescriptionFromToolCall(toolCall: ToolCall): {
  description: string
  finishedDescription?: string
} {
  const name = toolCall.name as LatteTool
  const params = toolCall.arguments

  switch (name) {
    case LatteTool.listProjects:
      return {
        description: `Listing projects`,
        finishedDescription: `Listed projects`,
      }

    case LatteTool.listPrompts:
      return {
        description: `Listing prompts`,
        finishedDescription: `Listed prompts`,
      }

    case LatteTool.readPrompt:
      return {
        description: `Reading prompt ${params.path}`,
        finishedDescription: `Read prompt ${params.path}`,
      }

    default:
      return {
        description: name,
      }
  }
}
