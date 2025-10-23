import { Tool } from 'ai'
import { jsonSchema } from '@ai-sdk/provider-utils'
import { BadRequestError, LatitudeError, NotFoundError } from '../../errors'
import { PromisedResult } from '../../Transaction'
import { Result } from '../../Result'
import { ResolvedTools } from './types'
import { IntegrationsRepository } from '../../../repositories'
import { listTools } from '../../../services/integrations'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import { callIntegrationTool } from '../../../services/integrations/McpClient/callTool'
import { StreamManager } from '..'
import { IntegrationType, McpTool } from '@latitude-data/constants'
import { telemetry } from '../../../telemetry'
import { publisher } from '../../../events/publisher'
import { ToolSource } from '@latitude-data/constants/toolSources'
import { getIntegrationToolsFromConfig } from '../../../services/documents/fork/helpers'
import { PipedreamIntegrationConfiguration } from '../../../services/integrations/helpers/schema'
import { IntegrationDto } from '../../../schema/models/types/Integration'

type LoadedIntegration = {
  integration: IntegrationDto
  tools: {
    [key: string]: {
      definition: McpTool
      handler: Tool
    }
  }
}

const buildToolHandler = ({
  streamManager,
  integration,
  toolDefinition,
}: {
  streamManager: StreamManager
  integration: IntegrationDto
  toolDefinition: McpTool
}): Tool =>
  ({
    description: toolDefinition?.description?.slice(0, 1023) ?? '',
    inputSchema: jsonSchema(toolDefinition.inputSchema),
    execute: async (args, toolCall) => {
      const $tool = telemetry.tool(streamManager.$completion!.context, {
        name: toolDefinition.name,
        call: {
          id: toolCall.toolCallId,
          arguments: args,
        },
      })

      publisher.publishLater({
        type: 'toolExecuted',
        data: {
          workspaceId: streamManager.workspace.id,
          type: 'integration',
          toolName: toolDefinition.name,
          integration: {
            id: integration.id,
            name: integration.name,
            type: integration.type,
          },
        },
      })

      try {
        const value = await callIntegrationTool({
          integration,
          toolName: toolDefinition.name,
          args,
          streamManager,
        }).then((r) => r.unwrap())

        $tool?.end({ result: { value, isError: false } })

        return {
          value,
          isError: false,
        }
      } catch (err) {
        const result = {
          value: (err as Error).message,
          isError: true,
        }

        $tool?.end({ result })

        return result
      }
    },
  }) satisfies Tool

async function loadIntegrations({
  toolIds,
  streamManager,
}: {
  toolIds: string[]
  streamManager: StreamManager
}): PromisedResult<LoadedIntegration[], LatitudeError> {
  const integrationsScope = new IntegrationsRepository(
    streamManager.workspace.id,
  )
  const data: LoadedIntegration[] = []

  for (const toolId of toolIds) {
    const [integrationName, toolName] = toolId.split('/')
    if (!integrationName?.length || !toolName?.length) {
      return Result.error(new BadRequestError(`Invalid tool: '${toolId}'`))
    }

    if (data.find((d) => d.integration.name === integrationName)) {
      // Integration already loaded
      continue
    }

    const integrationResult =
      await integrationsScope.findByName(integrationName)
    if (integrationResult.error) return integrationResult
    const integration = integrationResult.unwrap()

    const toolsResult = await listTools(integration, streamManager)
    if (toolsResult.error) return toolsResult
    const toolDefinitions = toolsResult.unwrap()

    data.push({
      integration,
      tools: Object.fromEntries(
        toolDefinitions.map((toolDefinition) => [
          toolDefinition.name,
          {
            definition: toolDefinition,
            handler: buildToolHandler({
              streamManager,
              integration,
              toolDefinition,
            }),
          },
        ]),
      ),
    })
  }

  return Result.ok(data)
}

export async function resolveIntegrationTools({
  config,
  streamManager,
}: {
  config: LatitudePromptConfig
  streamManager: StreamManager
}): PromisedResult<ResolvedTools, LatitudeError> {
  const tools = config.tools
  if (!tools) {
    return Result.ok({})
  }

  // Old schema: tools is a { [name: string]: ToolDefinition } object
  if (typeof tools === 'object' && !Array.isArray(tools) && tools !== null) {
    // There are no integration tools in old schema
    return Result.ok({})
  }

  // New schema
  const toolIds = getIntegrationToolsFromConfig(config).filter(
    (key) => !key.startsWith('latitude/'),
  )
  const integrationToolsResult = await loadIntegrations({
    toolIds,
    streamManager,
  })
  if (integrationToolsResult.error) return integrationToolsResult
  const integrationTools = integrationToolsResult.unwrap()

  const resolvedTools: ResolvedTools<ToolSource.Integration> = {}
  for (const toolId of toolIds) {
    const [integrationName, toolName] = toolId.split('/')
    if (!integrationName?.length || !toolName?.length) {
      return Result.error(new BadRequestError(`Invalid tool: '${toolId}'`))
    }

    const integrationData = integrationTools.find(
      (i) => i.integration.name === integrationName,
    )
    if (!integrationData) {
      return Result.error(
        new NotFoundError(`Integration '${integrationName}' not found`),
      )
    }

    const { tools, integration } = integrationData

    const imageUrl =
      integration.type === IntegrationType.Pipedream
        ? (integration.configuration as PipedreamIntegrationConfiguration)
            ?.metadata?.imageUrl
        : undefined

    if (toolName === '*') {
      // All tools from integration
      Object.entries(tools).forEach(([toolName, tool]) => {
        resolvedTools[toolName] = {
          definition: tool.handler,
          sourceData: {
            source: ToolSource.Integration,
            integrationId: integration.id,
            toolLabel: tool.definition.displayName,
            imageUrl,
          },
        }
      })
    } else {
      // Single tool from integration
      const tool = tools[toolName]
      if (!tool) {
        return Result.error(
          new NotFoundError(
            `Tool '${toolName}' not found in Integration '${integrationName}'`,
          ),
        )
      }

      resolvedTools[toolName] = {
        definition: tool.handler,
        sourceData: {
          source: ToolSource.Integration,
          integrationId: integration.id,
          toolLabel: tool.definition.displayName,
          imageUrl,
        },
      }
    }
  }

  return Result.ok(resolvedTools)
}
