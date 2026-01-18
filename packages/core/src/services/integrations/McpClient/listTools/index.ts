import { IntegrationType, McpTool } from '@latitude-data/constants'
import { JSONSchema7 } from 'json-schema'
import { IntegrationDto } from '../../../../schema/models/types/Integration'
import { LatitudeError } from '../../../../lib/errors'
import { Result } from '../../../../lib/Result'
import { PromisedResult } from '../../../../lib/Transaction'
import { touchIntegration } from '../../touch'
import { getMcpClient } from '../McpClientManager'
import { fixToolSchema } from './fixToolSchema'
import { listPipedreamIntegrationTools } from '../../pipedream/listTools'

export async function listTools(
  integration: IntegrationDto,
): PromisedResult<McpTool[], LatitudeError> {
  if (integration.type === IntegrationType.Pipedream) {
    const toolsResult = await listPipedreamIntegrationTools(
      integration.configuration.appName,
    )
    if (!Result.isOk(toolsResult)) {
      return Result.error(new LatitudeError(toolsResult.error.message))
    }

    const tools = toolsResult.unwrap()
    const fixedTools = tools.map((tool) => ({
      ...tool,
      inputSchema: fixToolSchema(tool.inputSchema as JSONSchema7),
    }))
    return Result.ok(fixedTools as McpTool[])
  }

  const clientResult = await getMcpClient(integration)
  if (clientResult.error) {
    return clientResult
  }
  const client = clientResult.unwrap()

  try {
    const { tools } = await client.listTools()

    const touchResult = await touchIntegration(integration.id)
    if (touchResult.error) {
      return Result.error(new LatitudeError(touchResult.error.message))
    }

    const fixedTools = tools.map((tool) => ({
      ...tool,
      inputSchema: fixToolSchema(tool.inputSchema as JSONSchema7),
    }))

    return Result.ok(fixedTools as McpTool[])
  } catch (err) {
    const error = err as Error
    return Result.error(
      new LatitudeError(
        `Error listing tools from Integration '${integration.name}': ${error.message}`,
      ),
    )
  }
}
