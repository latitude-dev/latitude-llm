import { McpTool } from '@latitude-data/constants'
import { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js'
import { Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'
import { LatitudeError } from '../../../lib/errors'
import { createMcpTransport } from './utils'

const PING_TIMEOUT_MS = 5000

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

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Connection timeout')), PING_TIMEOUT_MS)
    })

    await Promise.race([client.connect(transport), timeoutPromise])
    const response = await Promise.race([client.listTools(), timeoutPromise])

    return Result.ok(response.tools as McpTool[])
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Connection failed'
    return Result.error(
      new LatitudeError(`Failed to connect to MCP server: ${message}`),
    )
  } finally {
    try {
      await client.close()
    } catch {
      // Ignore close errors
    }
  }
}
