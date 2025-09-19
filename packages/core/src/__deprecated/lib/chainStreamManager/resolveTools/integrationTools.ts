import { ToolDefinition } from '@latitude-data/constants'
import {
  BadRequestError,
  LatitudeError,
  NotFoundError,
} from '../../../../lib/errors'
import { PromisedResult } from '../../../../lib/Transaction'
import { Result } from '../../../../lib/Result'
import { ResolvedTools, ToolSource } from './types'
import { IntegrationsRepository } from '../../../../repositories'
import { Workspace } from '../../../../browser'
import { listTools } from '../../../../services/integrations'
import { ChainStreamManager } from '..'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'

export async function resolveIntegrationTools({
  workspace,
  config,
  chainStreamManager,
}: {
  workspace: Workspace
  config: LatitudePromptConfig
  chainStreamManager?: ChainStreamManager
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
  const integrationsScope = new IntegrationsRepository(workspace.id)
  const integrationTools: Record<string, Record<string, ToolDefinition>> = {}

  for (const [integrationName, toolName] of integrationToolIds) {
    if (!integrationTools[integrationName]) {
      const integrationResult =
        await integrationsScope.findByName(integrationName)
      if (!Result.isOk(integrationResult)) return integrationResult
      const integration = integrationResult.unwrap()

      // TODO(compiler): fix types
      // @ts-expect-error - TODO: fix types
      const toolsResult = await listTools(integration, chainStreamManager)
      if (!Result.isOk(toolsResult)) return toolsResult
      const mcpTools = toolsResult.unwrap()

      integrationTools[integrationName] = Object.fromEntries(
        mcpTools.map((mcpTool) => [
          mcpTool.name,
          {
            description: mcpTool?.description?.slice(0, 1023) ?? '',
            parameters: mcpTool.inputSchema,
          },
        ]),
      )
    }

    const integrationAvailableTools = integrationTools[integrationName]

    if (toolName === '*') {
      Object.entries(integrationAvailableTools).forEach(
        ([toolName, definition]) => {
          const customToolName = `${integrationName}_${toolName}`
          resolvedTools[customToolName] = {
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

    const customToolName = `${integrationName}_${toolName}`
    resolvedTools[customToolName] = {
      definition: integrationAvailableTools[toolName],
      sourceData: { source: ToolSource.Integration, integrationName, toolName },
    }
  }

  return Result.ok(resolvedTools)
}
