import { ToolCall } from '@latitude-data/constants'
import { LatteTool } from '@latitude-data/constants/latte'

export function getDescriptionFromToolCall(toolCall: ToolCall): {
  activeDescription: string
  finishedDescription?: string
} {
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

    default:
      return {
        activeDescription: name,
      }
  }
}
