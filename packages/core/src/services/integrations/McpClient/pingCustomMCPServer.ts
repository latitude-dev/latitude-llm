import { McpTool } from '@latitude-data/constants'
import { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'

export async function pingCustomMCPServer(
  url: string,
): PromisedResult<McpTool[]> {
  let urlObject: URL
  try {
    urlObject = new URL(url)
  } catch (error) {
    return Result.error(error as Error)
  }

  const transport = new SSEClientTransport(urlObject)

  const client = new McpClient({
    name: 'ping-test',
    version: '1.0.0',
  })

  await client.connect(transport)
  const response = await client.listTools()
  return Result.ok(response.tools as McpTool[])
}
