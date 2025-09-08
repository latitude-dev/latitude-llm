import { LatteTool } from '@latitude-data/constants/latte'
import { ToolCall } from 'ai'
import { LatteToolStep } from './types'

export function getDescriptionFromToolCall(
  toolCall: ToolCall<string, Record<string, unknown>>,
): Partial<LatteToolStep> {
  const name = toolCall.toolName
  const params = toolCall.args
  const latteTools = Object.values(LatteTool)

  if (latteTools.includes(name as LatteTool)) {
    return getDescriptionFromLatteTool(name as LatteTool, params)
  }
  return getLatteSubagentDescription(name, params)
}

function getTriggerName(params: Record<string, unknown>): string {
  return (params.componentId ||
    (params.triggerSpecification as Record<string, unknown>)
      .triggerType) as string
}

function getDescriptionFromLatteTool(
  toolName: LatteTool,
  params: Record<string, unknown>,
): Partial<LatteToolStep> {
  switch (toolName) {
    case LatteTool.listProjects:
      return {
        activeDescription: 'Looking through your projects...',
        finishedDescription: 'Found your projects',
      }

    case LatteTool.listDrafts:
      return {
        activeDescription: `Scanning through your drafts...`,
        finishedDescription: `Found your drafts`,
      }

    case LatteTool.listPrompts:
      return {
        activeDescription: `Browsing through your prompts...`,
        finishedDescription: `Found your prompts`,
      }

    case LatteTool.readPrompt:
      return {
        activeDescription: `Reading through ${params.path}...`,
        finishedDescription: `Read prompt ${params.path}`,
      }

    case LatteTool.listProviders:
      return {
        activeDescription: `Collecting existing providers...`,
        finishedDescription: `Collected existing providers`,
      }

    case LatteTool.listExistingIntegrations:
      return {
        activeDescription: `Gathering existing integrations...`,
        finishedDescription: `Gathered existing integrations`,
      }

    case LatteTool.listIntegrationTools:
      return {
        activeDescription: `Collecting tools for ${params.integrationAppName}...`,
        finishedDescription: `Collected tools for ${params.integrationAppName}`,
      }

    case LatteTool.listIntegrationTriggers:
      return {
        activeDescription: `Finding triggers for ${params.integrationAppName}...`,
        finishedDescription: `Found triggers for ${params.integrationAppName}`,
      }

    case LatteTool.writePrompt:
      return {
        activeDescription: `Writing prompt ${params.path}...`,
        finishedDescription: `Wrote prompt ${params.path}`,
      }

    case LatteTool.deletePrompt:
      return {
        activeDescription: `Deleting prompt ${params.path}...`,
        finishedDescription: `Deleted prompt ${params.path}`,
      }

    case LatteTool.editProject:
      return {
        activeDescription: `Updating your project configuration...`,
        finishedDescription: `Updated project configuration`,
      }

    case LatteTool.searchAvailableIntegrations:
      return {
        activeDescription: `Searching integrations with keyword ${params.query}...`,
        finishedDescription: `Searched integrations with keyword ${params.query}`,
      }

    case LatteTool.createIntegration:
      return {
        activeDescription: `Creating new ${params.app} integration...`,
        finishedDescription: `Created new ${params.app} integration`,
      }

    case LatteTool.getFullTriggerSchema:
      return {
        activeDescription: `Looking up configuration for ${getTriggerName(params)}...`,
        finishedDescription: `Retrieved ${getTriggerName(params)} configuration`,
      }

    case LatteTool.validateTriggerSchema:
      return {
        activeDescription: `Validating configuration for ${getTriggerName(params)}...`,
        finishedDescription: `${getTriggerName(params)} configuration validated`,
      }

    case LatteTool.createTrigger:
      return {
        activeDescription: `Creating trigger ${getTriggerName(params)}...`,
        finishedDescription: `${getTriggerName(params)} trigger created`,
      }

    case LatteTool.deleteTrigger:
      return {
        activeDescription: `Deleting trigger ${getTriggerName(params)}...`,
        finishedDescription: `${getTriggerName(params)} trigger deleted`,
      }

    case LatteTool.updateTrigger:
      return {
        activeDescription: `Updating trigger ${getTriggerName(params)}...`,
        finishedDescription: `${getTriggerName(params)} trigger updated`,
      }
    default:
      return {
        activeDescription: toolName,
      }
  }
}

function getLatteSubagentDescription(
  toolName: string,
  params: Record<string, unknown>,
): Partial<LatteToolStep> {
  switch (toolName) {
    case 'lat_agent_latte_agents_documentation_ask_documentation':
      return {
        activeDescription: `Searching through the docs...`,
        finishedDescription: `Searched through documentation`,
        customIcon: 'bookMarked',
      }
    case 'lat_agent_latte_managers_build_manager':
      return {
        activeDescription: 'Planning out the brewing process...',
        finishedDescription: 'Brewed to perfection',
      }
    case 'lat_agent_latte_managers_investigator':
      return {
        activeDescription: `Taking a closer look...`,
        finishedDescription: `Investigation completed`,
      }
    case 'lat_agent_latte_agents_integrations_integration_manager':
      return {
        activeDescription: `Setting up ${params.integration_name} integration...`,
        finishedDescription: `Integration ${params.integration_name} configured`,
      }
    case 'lat_agent_latte_agents_integrations_trigger_manager':
      return {
        activeDescription: `Setting up ${params.integration_name} trigger...`,
        finishedDescription: `${params.integration_name} trigger configured`,
      }
    case 'lat_agent_latte_agents_building_prompt_editor':
      return {
        activeDescription: `Editing prompt ${params.full_path}...`,
        finishedDescription: `Edited prompt ${params.full_path}`,
      }
    case 'lat_agent_latte_agents_building_prompt_writer':
      return {
        activeDescription: `Crafting new prompts...`,
        finishedDescription: `New prompts crafted`,
      }
    case 'lat_agent_latte_agents_planning_project_architect':
      return {
        activeDescription: `Designing the project structure...`,
        finishedDescription: `Project structure designed`,
      }
    case 'lat_agent_latte_agents_reading_reader':
      return {
        activeDescription: `Understanding your prompts...`,
        finishedDescription: `Prompts understood`,
      }
    case 'lat_tool_run_code':
      return {
        activeDescription: `Doing magic...`,
        finishedDescription: `Spell casted`,
      }
    case 'lat_tool_web_search':
      return {
        activeDescription: `Browsing the web...`,
        finishedDescription: `Browsed the web`,
      }
    case 'lat_tool_web_extract':
      return {
        activeDescription: `Curating resources...`,
        finishedDescription: `Resources curated`,
      }
    default:
      return {
        activeDescription: toolName,
      }
  }
}
