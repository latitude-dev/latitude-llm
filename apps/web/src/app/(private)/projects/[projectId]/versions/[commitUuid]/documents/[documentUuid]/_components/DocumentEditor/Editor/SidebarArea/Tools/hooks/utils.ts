import { IntegrationType, ToolsItem } from "@latitude-data/constants"
import { LatitudePromptConfig } from "@latitude-data/constants/latitudePromptSchema"
import { ActiveIntegrations } from "../../../PromptIntegrations/useActiveIntegrations"
import { INTEGRATION_TYPE_VALUES } from "$/lib/integrationTypeOptions"
import { IntegrationDto } from "@latitude-data/core/schema/types"
import { IconName } from "@latitude-data/web-ui/atoms/Icons"

export function addIntegrationToActiveIntegrations({
  activeIntegrations,
  integrationName,
  toolName,
}: {
  activeIntegrations: ActiveIntegrations
  integrationName: string
  toolName: string
}) {
  if (activeIntegrations[integrationName] === true) return activeIntegrations
  if (
    activeIntegrations[integrationName] &&
    Array.isArray(activeIntegrations[integrationName]) &&
    activeIntegrations[integrationName].includes(toolName)
  ) {
    return activeIntegrations
  }

  const existing = activeIntegrations[integrationName] ?? []
  return {
    ...activeIntegrations,
    [integrationName]:
      toolName === '*'
        ? true
        : [...(Array.isArray(existing) ? existing : []), toolName],
  } satisfies ActiveIntegrations
}

// Converts the old tools format to the regular one
function normalizeIntegrations(tools: LatitudePromptConfig['tools']) {
  if (!tools) return []
  if (Array.isArray(tools)) return tools

  return Object.entries(tools).map(([toolName, toolDefinition]) => ({
    [toolName]: toolDefinition,
  }))
}

export function updateExistingToolsFromConfig({
  tools: currentTools,
  integrationName,
  toolName,
}: {
  tools: LatitudePromptConfig['tools']
  integrationName: string
  toolName: string
}) {
  const tools = (normalizeIntegrations(currentTools) as ToolsItem[]) ?? []
  const clientTools = tools.filter(
    (tool: ToolsItem) => typeof tool !== 'string',
  )
  const integrationTools = tools.filter(
    (tool: ToolsItem) => typeof tool === 'string',
  )
  if (integrationTools.includes(`${integrationName}/*`)) return tools
  if (integrationTools.includes(`${integrationName}/${toolName}`)) return tools

  if (toolName === '*') {
    const otherIntegrationTools = integrationTools.filter(
      (integrationId) => integrationId.split('/')[0] !== integrationName,
    )
    return [...clientTools, ...otherIntegrationTools, `${integrationName}/*`]
  }

  return [...clientTools, ...integrationTools, `${integrationName}/${toolName}`]
}

export function removeToolsFromConfigTools({
  tools: currentTools,
  integrationName: removedIntegrationName,
  toolName: removedToolName,
  integrationToolNames,
}: {
  tools: LatitudePromptConfig['tools']
  integrationName: string
  toolName: string
  integrationToolNames: string[]
}) {
  const tools = (normalizeIntegrations(currentTools) as ToolsItem[]) ?? []

  if (removedToolName === '*') {
    return tools.filter((tool: ToolsItem) => {
      if (typeof tool !== 'string') return true

      return !tool.startsWith(`${removedIntegrationName}/`)
    })
  }

  const integrationToolsToAdd = tools.includes(`${removedIntegrationName}/*`)
    ? integrationToolNames.filter((tn) => tn !== removedToolName)
    : []

  return tools
    .filter((tool: ToolsItem) => {
      if (typeof tool !== 'string') return true
      const [integrationName, toolName] = tool.split('/')
      if (integrationName !== removedIntegrationName) return true
      if (toolName === '*') return false
      if (integrationToolsToAdd.includes(toolName ?? '*')) return false
      return toolName !== removedToolName
    })
    .concat(
      integrationToolsToAdd.map((tn) => `${removedIntegrationName}/${tn}`),
    )
}

export function integrationOptions(integration: IntegrationDto) {
  if (integration.type === IntegrationType.Pipedream) {
    const imageUrl = integration.configuration.metadata?.imageUrl ?? 'unplug'
    const label =
      integration.configuration.metadata?.displayName ??
      integration.configuration.appName
    return {
      label,
      icon: {
        type: 'image' as const,
        src: imageUrl,
        alt: label,
      },
    }
  }

  if (integration.type === IntegrationType.Latitude) {
    const { label } = INTEGRATION_TYPE_VALUES[IntegrationType.Latitude]
    return {
      label,
      icon: {
        type: 'icon' as const,
        name: 'logo' as IconName,
      },
    }
  }
  const { label, icon } = INTEGRATION_TYPE_VALUES[integration.type]
  return { label, icon: { type: 'icon' as const, name: icon as IconName } }
}

