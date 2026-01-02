import { McpTool } from '@latitude-data/constants'
import { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js'
import { Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'
import { createMcpTransport } from './utils'

type PingOptions = {
  headers?: Record<string, string>
}

export async function pingCustomMCPServer(
  url: string,
  options?: PingOptions,
): PromisedResult<McpTool[]> {
  const transportResult = createMcpTransport(url, {
    headers: options?.headers,
  })
  if (!Result.isOk(transportResult)) return transportResult
  const transport = transportResult.unwrap()

  const client = new McpClient({
    name: 'ping-test',
    version: '1.0.0',
  })

  await client.connect(transport)
  const response = await client.listTools()
  return Result.ok(response.tools as McpTool[])
}
