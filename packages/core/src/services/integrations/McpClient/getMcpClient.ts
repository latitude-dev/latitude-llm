import { IntegrationDto } from '../../../browser'
import {
  LatitudeError,
  NotFoundError,
  PromisedResult,
  Result,
} from '../../../lib'
import { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'

export async function getMcpClient(
  integration: IntegrationDto,
): PromisedResult<McpClient, LatitudeError> {
  let clientUrl = integration.configuration?.url
  if (!clientUrl) {
    return Result.error(
      new NotFoundError(
        'MCP server URL not found in integration configuration',
      ),
    )
  }

  // Add http:// protocol if the URL doesn't include a protocol
  if (!clientUrl.match(/^https?:\/\//)) {
    clientUrl = `http://${clientUrl}`
  }
  // Add /sse path if the URL doesn't include a path
  if (!clientUrl.match(/\/sse$/)) {
    clientUrl = `${clientUrl}/sse`
  }

  const transport = new SSEClientTransport(new URL(clientUrl))

  const client = new McpClient({
    name: integration.name,
    version: '1.0.0',
  })

  try {
    await client.connect(transport)
    return Result.ok(client)
  } catch (err) {
    const error = err as Error
    return Result.error(
      new LatitudeError(
        `Error establishing connection with Integration server '${integration.name}': ${error.message}`,
      ),
    )
  }
}
