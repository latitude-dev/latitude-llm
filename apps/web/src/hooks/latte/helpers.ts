import { LatteTool } from '@latitude-data/constants/latte'
import type { LatteToolStep } from './types'
import type { ToolCall } from 'ai'

export function getDescriptionFromToolCall(
  toolCall: ToolCall<string, Record<string, unknown>>,
): Partial<LatteToolStep> {
  const name = toolCall.toolName as LatteTool
  const params = toolCall.args

  switch (name) {
    case LatteTool.listProjects:
      return {
        activeDescription: `Listing projects`,
        finishedDescription: `Listed projects`,
      }

    case LatteTool.listDrafts:
      return {
        activeDescription: `Listing drafts in your project`,
        finishedDescription: `Listed drafts in your project`,
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

    case LatteTool.listProviders:
      return {
        activeDescription: `Listing providers`,
        finishedDescription: `Listed providers`,
      }

    case LatteTool.listIntegrations:
      return {
        activeDescription: `Listing integrations`,
        finishedDescription: `Listed integrations`,
      }

    case LatteTool.listIntegrationTools:
      return {
        activeDescription: `Reading tools from integration '${params.name}'`,
        finishedDescription: `Read tools from integration '${params.name}'`,
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
