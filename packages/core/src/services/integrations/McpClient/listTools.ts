import { McpTool } from '@latitude-data/constants'
import { IntegrationDto } from '../../../browser'
import { LatitudeError, PromisedResult, Result } from '../../../lib'
import { getMcpClient } from './getMcpClient'
import { touchIntegration } from '../touch'

export async function listTools(
  integration: IntegrationDto,
): PromisedResult<McpTool[], LatitudeError> {
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

    return Result.ok(tools as McpTool[])
  } catch (err) {
    const error = err as Error
    return Result.error(
      new LatitudeError(
        `Error listing tools from Integration '${integration.name}': ${error.message}`,
      ),
    )
  }
}
