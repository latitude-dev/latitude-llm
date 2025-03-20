import { McpTool } from '@latitude-data/constants'
import { IntegrationDto } from '../../../../browser'
import { LatitudeError, PromisedResult, Result } from '../../../../lib'
import { getMcpClient } from '../McpClientManager'
import { touchIntegration } from '../../touch'
import { fixToolSchema } from './fixToolSchema'
import { JSONSchema7 } from 'json-schema'
import { ChainStreamManager } from '../../../../lib/chainStreamManager'

export async function listTools(
  integration: IntegrationDto,
  chainStreamManager?: ChainStreamManager,
): PromisedResult<McpTool[], LatitudeError> {
  const clientResult = await getMcpClient(integration, chainStreamManager)
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
