import { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { LatitudeError } from '../../../lib/errors'
import { Result } from './../../../lib/Result'
import { TypedResult } from './../../../lib/Result'

// Types
export interface McpClientConnection {
  client: McpClient
  transport: SSEClientTransport
}

export interface RetryConfig {
  maxRetries: number
  maxTimeout: number
  initialDelay: number
  startupTimeout?: number // Optional startup timeout in milliseconds
}

// Errors
export class McpConnectionError extends LatitudeError {
  constructor(
    message: string,
    public readonly cause?: Error,
  ) {
    super(message)
    this.name = 'McpConnectionError'
  }
}

export class McpUrlError extends LatitudeError {
  constructor(message: string) {
    super(message)
    this.name = 'McpUrlError'
  }
}

// Constants
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 10,
  maxTimeout: 30000, // 30 seconds
  initialDelay: 1000, // 1 second
}

// Helper Functions
export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

export function normalizeMcpUrl(url: string): TypedResult<URL, McpUrlError> {
  try {
    // Add http:// protocol if the URL doesn't include a protocol
    const urlWithProtocol = url.match(/^https?:\/\//) ? url : `http://${url}`
    // Add /sse path if the URL doesn't include a path
    const urlWithPath = urlWithProtocol.match(/\/sse$/)
      ? urlWithProtocol
      : `${urlWithProtocol}/sse`
    return Result.ok(new URL(urlWithPath))
  } catch (error) {
    return Result.error(new McpUrlError(`Invalid MCP server URL: ${url}`))
  }
}

export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
): Promise<TypedResult<T, McpConnectionError>> {
  let lastError: Error | undefined

  // If startup timeout is specified, wait for it before starting retries
  if (config.startupTimeout) {
    await sleep(config.startupTimeout)
  }

  for (let attempt = 0; attempt < config.maxRetries; attempt++) {
    try {
      return Result.ok(await operation())
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))

      const delay = Math.min(
        config.initialDelay * Math.pow(2, attempt),
        config.maxTimeout,
      )

      await sleep(delay)
    }
  }

  return Result.error(
    new McpConnectionError(
      `Operation failed after ${config.maxRetries} attempts`,
      lastError,
    ),
  )
}
