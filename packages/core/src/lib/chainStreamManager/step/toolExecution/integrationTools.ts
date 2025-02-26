import { ToolSource } from '../../resolveTools/types'
import { Result } from '../../../Result'
import { NotFoundError } from '../../../errors'
import { PromisedResult } from '../../../Transaction'
import { ToolResponsesArgs } from './types'
import { callIntegrationTool } from '../../../../services/integrations/McpClient/callTool'
import { IntegrationsRepository } from '../../../../repositories'

export function getIntegrationToolCallResults({
  workspace,
  toolCalls,
  resolvedTools,
}: ToolResponsesArgs): PromisedResult<unknown>[] {
  return toolCalls.map(async (toolCall) => {
    const toolSourceData = resolvedTools[toolCall.name]?.sourceData
    if (toolSourceData?.source !== ToolSource.Integration) {
      return Result.error(new NotFoundError(`Unknown tool`))
    }

    const integrationsScope = new IntegrationsRepository(workspace.id)
    const integrationResult = await integrationsScope.findByName(
      toolSourceData.integrationName,
    )
    if (integrationResult.error) return integrationResult
    const integration = integrationResult.unwrap()

    return callIntegrationTool({
      integration,
      toolName: toolSourceData.toolName,
      args: toolCall.arguments,
    })
  })
}
