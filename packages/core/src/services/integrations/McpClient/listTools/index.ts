import { McpTool } from '@latitude-data/constants'
import { IntegrationDto } from '../../../../browser'
import { getMcpClient } from '../McpClientManager'
import { touchIntegration } from '../../touch'
import { fixToolSchema } from './fixToolSchema'
import { JSONSchema7 } from 'json-schema'
import { LatitudeError } from './../../../../lib/errors'
import { PromisedResult } from './../../../../lib/Transaction'
import { Result } from './../../../../lib/Result'
import { StreamManager } from '../../../../lib/streamManager'

export async function listTools(
  integration: IntegrationDto,
  streamManager?: StreamManager,
): PromisedResult<McpTool[], LatitudeError> {
  const clientResult = await getMcpClient(integration, streamManager)
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
