import { BadRequestError, LatitudeError, NotFoundError } from '../../errors'
import { PromisedResult } from '../../Transaction'
import { Result } from '../../Result'
import { ResolvedTools, ToolSource } from './types'
import { IntegrationsRepository } from '../../../repositories'
import { listTools } from '../../../services/integrations'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import { Tool } from 'ai'
import { callIntegrationTool } from '../../../services/integrations/McpClient/callTool'
import { StreamManager } from '..'
import { LATITUDE_TOOL_PREFIX } from '@latitude-data/constants'
import { telemetry } from '../../../telemetry'
import { publisher } from '../../../events/publisher'

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
  const toolIds = tools.filter((t) => typeof t === 'string')
  const integrationToolIds: [string, string][] = toolIds
    .map((t) => t.split('/') as [string, string])
    .filter(([toolSource]) => toolSource !== 'latitude') // Latitude tools are handled separately

  const invalidToolId = integrationToolIds.find((t) => t.length !== 2)
  if (invalidToolId) {
    return Result.error(
      new BadRequestError(`Invalid tool id: '${invalidToolId.join('/')}'`),
    )
  }

  const resolvedTools: ResolvedTools = {}
  const integrationsScope = new IntegrationsRepository(
    streamManager.workspace.id,
  )
  const integrationTools: Record<string, Record<string, Tool>> = {}

  for (const [integrationName, toolName] of integrationToolIds) {
    const integrationAvailableTools = await addIntegrationTools({
      integrationTools,
      integrationName,
      integrationsScope,
      streamManager,
    }).then((r) => r.unwrap())

    if (toolName === '*') {
      Object.entries(integrationAvailableTools).forEach(
        ([toolName, definition]) => {
          resolvedTools[
            `${LATITUDE_TOOL_PREFIX}_${integrationName}_${toolName}`
          ] = {
            definition,
            sourceData: {
              source: ToolSource.Integration,
              integrationName,
              toolName,
            },
          }
        },
      )

      continue
    }

    if (!integrationAvailableTools[toolName]) {
      return Result.error(
        new NotFoundError(
          `Tool '${toolName}' not found in Integration '${integrationName}'`,
        ),
      )
    }

    resolvedTools[`${LATITUDE_TOOL_PREFIX}_${integrationName}_${toolName}`] = {
      definition: integrationAvailableTools[toolName],
      sourceData: { source: ToolSource.Integration, integrationName, toolName },
    }
  }

  return Result.ok(resolvedTools)
}

async function addIntegrationTools({
  integrationTools,
  integrationName,
  integrationsScope,
  streamManager,
}: {
  integrationTools: Record<string, Record<string, Tool>>
  integrationName: string
  integrationsScope: IntegrationsRepository
  streamManager: StreamManager
}) {
  if (integrationTools[integrationName])
    return Result.ok(integrationTools[integrationName])

  const integrationResult = await integrationsScope.findByName(integrationName)
  if (integrationResult.error) return integrationResult
  const integration = integrationResult.unwrap()

  const toolsResult = await listTools(integration, streamManager)
  if (toolsResult.error) return toolsResult
  const mcpTools = toolsResult.unwrap()

  integrationTools[integrationName] = Object.fromEntries(
    mcpTools.map((mcpTool) => [
      `${mcpTool.name}`,
      {
        description: mcpTool?.description?.slice(0, 1023) ?? '',
        parameters: mcpTool.inputSchema,
        execute: async (args, toolCall) => {
          const $tool = telemetry.tool(streamManager.$completion!.context, {
            name: `${LATITUDE_TOOL_PREFIX}_${integrationName}_${mcpTool.name}`,
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
              toolName: mcpTool.name,
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
              toolName: mcpTool.name,
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
      },
    ]),
  )

  return Result.ok(integrationTools[integrationName])
}
