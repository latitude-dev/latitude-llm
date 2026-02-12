import { jsonSchema } from '@ai-sdk/provider-utils'
import {
  BadRequestError,
  LatitudeError,
  NotFoundError,
} from '../../../../lib/errors'
import { PromisedResult } from '../../../../lib/Transaction'
import { Result } from '../../../../lib/Result'
import {
  ResolvedToolsDict,
  ToolManifestDict,
} from '@latitude-data/constants/tools'
import { IntegrationsRepository } from '../../../../repositories'
import { listTools } from '../../../../services/integrations'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import { IntegrationType } from '@latitude-data/constants'
import { ToolSource } from '@latitude-data/constants/toolSources'
import { getIntegrationToolsFromConfig } from '../../../../services/documents/fork/helpers'
import { PipedreamIntegrationConfiguration } from '../../../../services/integrations/helpers/schema'
import { Workspace } from '../../../../schema/models/types/Workspace'

type ToolManifestDictByIntegration = {
  [integrationName: string]: ToolManifestDict<ToolSource.Integration>
}

async function lookupToolsByIntegration({
  toolIds,
  workspace,
}: {
  toolIds: string[]
  workspace: Workspace
}): PromisedResult<ToolManifestDictByIntegration, LatitudeError> {
  const integrationsScope = new IntegrationsRepository(workspace.id)
  const lookedUpDicts: ToolManifestDictByIntegration = {}

  for (const toolId of toolIds) {
    const [integrationName, toolName] = toolId.split('/')
    if (!integrationName?.length || !toolName?.length) {
      return Result.error(new BadRequestError(`Invalid tool: '${toolId}'`))
    }

    if (integrationName in lookedUpDicts) {
      // Integration already looked up
      continue
    }

    const integrationResult =
      await integrationsScope.findByName(integrationName)
    if (integrationResult.error) return integrationResult
    const integration = integrationResult.unwrap()

    const toolsResult = await listTools(integration)
    if (toolsResult.error) return toolsResult
    const toolDefinitions = toolsResult.unwrap()

    lookedUpDicts[integrationName] = Object.fromEntries(
      toolDefinitions.map((toolDefinition) => [
        toolDefinition.name,
        {
          definition: {
            description: toolDefinition.description,
            inputSchema: jsonSchema(toolDefinition.inputSchema),
          },
          sourceData: {
            source: ToolSource.Integration,
            integrationId: integration.id,
            toolName: toolDefinition.name,
            toolLabel: toolDefinition.displayName,
            imageUrl:
              integration.type === IntegrationType.Pipedream
                ? (
                    integration.configuration as PipedreamIntegrationConfiguration
                  )?.metadata?.imageUrl
                : undefined,
          },
        },
      ]),
    )
  }

  return Result.ok(lookedUpDicts)
}

export async function lookupIntegrationTools({
  config,
  workspace,
}: {
  config: Pick<LatitudePromptConfig, 'tools'>
  workspace: Workspace
}): PromisedResult<ToolManifestDict<ToolSource.Integration>, LatitudeError> {
  const { tools } = config
  if (!tools) return Result.ok({})

  // Old schema: tools is a { [name: string]: ToolDefinition } object
  if (typeof tools === 'object' && !Array.isArray(tools) && tools !== null) {
    // There are no integration tools in old schema
    return Result.ok({})
  }

  // New schema
  const toolIds = getIntegrationToolsFromConfig(config).filter(
    (key) => !key.startsWith('latitude/'),
  )
  const integrationToolsResult = await lookupToolsByIntegration({
    toolIds,
    workspace,
  })
  if (integrationToolsResult.error) return integrationToolsResult
  const integrationTools = integrationToolsResult.unwrap()

  const resolvedTools: ResolvedToolsDict<ToolSource.Integration> = {}
  for (const toolId of toolIds) {
    const [integrationName, toolName] = toolId.split('/')
    if (!integrationName?.length || !toolName?.length) {
      return Result.error(new BadRequestError(`Invalid tool: '${toolId}'`))
    }

    const integrationToolsDict = integrationTools[integrationName]
    if (!integrationToolsDict) {
      return Result.error(
        new NotFoundError(`Integration '${integrationName}' not found`),
      )
    }

    if (toolName === '*') {
      for (const [name, tool] of Object.entries(integrationToolsDict)) {
        resolvedTools[`${integrationName}_${name}`] = tool
      }
    } else {
      const tool = integrationToolsDict[toolName]
      if (!tool) {
        return Result.error(
          new NotFoundError(
            `Tool '${toolName}' not found in Integration '${integrationName}'`,
          ),
        )
      }

      resolvedTools[`${integrationName}_${toolName}`] = tool
    }
  }

  return Result.ok(resolvedTools)
}
