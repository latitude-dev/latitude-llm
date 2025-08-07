import { ChainStreamManager } from '../..'
import { IntegrationDto } from '../../../../../browser'
import { NotFoundError } from '../../../../../lib/errors'
import { Result } from '../../../../../lib/Result'
import { PromisedResult } from '../../../../../lib/Transaction'
import { IntegrationsRepository } from '../../../../../repositories'
import { callIntegrationTool } from '../../../../../services/integrations/McpClient/callTool'
import { createMcpClientManager } from '../../../../../services/integrations/McpClient/McpClientManager'
import { ToolSource } from '../../resolveTools/types'
import { ToolResponsesArgs } from './types'

export function getIntegrationToolCallResults({
  workspace,
  toolCalls,
  resolvedTools,
  chainStreamManager,
}: ToolResponsesArgs & {
  chainStreamManager?: ChainStreamManager
  mcpClientManager?: ReturnType<typeof createMcpClientManager>
}): PromisedResult<unknown>[] {
  const integrationNames = Object.values(resolvedTools).reduce((acc, tool) => {
    if (tool.sourceData?.source === ToolSource.Integration) {
      acc.add(tool.sourceData.integrationName)
    }
    return acc
  }, new Set<string>())

  const integrationsScope = new IntegrationsRepository(workspace.id)
  const integrations: Record<
    string,
    PromisedResult<IntegrationDto>
  > = Object.fromEntries(
    [...integrationNames].map((name) => [
      name,
      integrationsScope.findByName(name),
    ]),
  )

  return toolCalls.map(async (toolCall) => {
    const toolSourceData = resolvedTools[toolCall.name]?.sourceData
    if (toolSourceData?.source !== ToolSource.Integration) {
      return Result.error(new NotFoundError(`Unknown tool`))
    }

    const integrationResult =
      await integrations[toolSourceData.integrationName]!
    if (integrationResult.error) return integrationResult
    const integration = integrationResult.unwrap()

    return callIntegrationTool({
      integration,
      toolName: toolSourceData.toolName,
      args: toolCall.arguments,
      // @ts-expect-error - TODO(compiler): fix types
      streamManager: chainStreamManager!,
    })
  })
}
