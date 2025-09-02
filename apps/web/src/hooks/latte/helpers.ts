import { LatteTool } from '@latitude-data/constants/latte'
import { LatteToolStep } from './types'
import { ToolCall } from 'ai'

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
        activeDescription: `Collecting your existing LLM providers...`,
        finishedDescription: `Collected your LLM providers`,
      }

    case LatteTool.listIntegrations:
      return {
        activeDescription: `Showing available integrations...`,
        finishedDescription: `Gathered available integrations`,
      }

    case LatteTool.listIntegrationTools:
      return {
        activeDescription: `Collecting tools from '${params.name}' integration...`,
        finishedDescription: `Collected tools from '${params.name}' integration`,
      }

    case LatteTool.listIntegrationTriggers:
      return {
        activeDescription: `Finding triggers from '${params.name}' integration...`,
        finishedDescription: `Found triggers from '${params.name}' integration`,
      }

    case LatteTool.writePrompt:
      return {
        activeDescription: `Writing prompt to ${params.path}...`,
        finishedDescription: `Wrote prompt to ${params.path}`,
      }

    case LatteTool.deletePrompt:
      return {
        activeDescription: `Deleting prompt ${params.path}...`,
        finishedDescription: `Deleted prompt ${params.path}`,
      }

    case LatteTool.editProject:
      return {
        activeDescription: `Editing your project configuration...`,
        finishedDescription: `Updated project configuration`,
      }

    case LatteTool.searchIntegrationApps:
      return {
        activeDescription: `Searching for useful integrations...`,
        finishedDescription: `Gathered useful integrations`,
      }

    case LatteTool.searchIntegrationResources:
      return {
        activeDescription: `Searching for ${params.type} from '${params.app}'...`,
        finishedDescription: `Found ${params.type} from '${params.app} integration'`,
      }

    case LatteTool.createIntegration:
      return {
        activeDescription: `Creating new '${params.app} integration'...`,
        finishedDescription: `Created new '${params.app} integration'`,
      }

    case LatteTool.listExistingTriggers:
      return {
        activeDescription: `Discovering existing triggers...`,
        finishedDescription: `Found existing triggers`,
      }

    case LatteTool.getFullTriggerSchema:
      return {
        activeDescription: `Looking up trigger configuration for '${params.componentId}'...`,
        finishedDescription: `Retrieved trigger configuration`,
      }

    case LatteTool.validateTriggerSchema:
      return {
        activeDescription: `Checking trigger configuration for '${params.componentId}'...`,
        finishedDescription: `Trigger configuration validated`,
      }

    case LatteTool.createTrigger:
      return {
        activeDescription: `Creating trigger ${params.componentId}...`,
        finishedDescription: `${params.componentId} trigger created`,
      }

    case LatteTool.deleteTrigger:
      return {
        activeDescription: `Deleting trigger ${params.componentId}...`,
        finishedDescription: `${params.componentId} trigger deleted`,
      }

    case LatteTool.updateTrigger:
      return {
        activeDescription: `Updating trigger ${params.componentId}...`,
        finishedDescription: `${params.componentId} trigger updated`,
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
        activeDescription: 'Figuring out what to build...',
        finishedDescription: 'Building phase completed',
      }
    case 'lat_agent_latte_managers_investigator':
      return {
        activeDescription: `Taking a closer look...`,
        finishedDescription: `Investigation completed`,
      }
    case 'lat_agent_latte_agents_integrations_integration_manager':
      return {
        activeDescription: 'Setting up your integration...',
        finishedDescription: `Integration ${params.name} configured`,
      }
    case 'lat_agent_latte_agents_triggers_trigger_manager':
      return {
        activeDescription: `Setting up your trigger...`,
        finishedDescription: `${params.componentId} trigger configured`,
      }
    case 'lat_agent_latte_agents_building_prompt_editor':
      return {
        activeDescription: `Editing prompt ${params.path}...`,
        finishedDescription: `Edited prompt ${params.path}`,
      }
    case 'lat_agent_latte_agents_building_prompt_writer':
      return {
        activeDescription: `Creating new prompts...`,
        finishedDescription: `New prompts added successfully`,
      }
    case 'lat_agent_latte_agents_planning_project_architect':
      return {
        activeDescription: `Designing the project structure...`,
        finishedDescription: `Design phase completed`,
      }
    case 'lat_agent_latte_agents_reading_reader':
      return {
        activeDescription: `Reading through the prompts...`,
        finishedDescription: `Prompt read successfully`,
      }
    case 'lat_tool_web_extract':
      return {
        activeDescription: `Searching through the web...`,
        finishedDescription: `Searched through the web`,
      }
    default:
      return {
        activeDescription: toolName,
      }
  }
}
