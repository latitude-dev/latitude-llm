import { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js'
import { LatitudeError } from '../../../lib/errors'
import { Result, TypedResult } from '../../../lib/Result'

// Types
export type McpClientTransport =
  | SSEClientTransport
  | StreamableHTTPClientTransport

export interface McpClientConnection {
  client: McpClient
  transport: McpClientTransport
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
export const PIPEDREAM_MCP_URL = 'https://remote.mcp.pipedream.net'

// Helper Functions
export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

type CreateMcpTransportOptions = {
  authProvider?: OAuthClientProvider
  headers?: Record<string, string>
}

export function createMcpTransport(
  url: string,
  options?: CreateMcpTransportOptions,
): TypedResult<McpClientTransport, McpUrlError> {
  const urlWithProtocol = url.match(/^https?:\/\//) ? url : `http://${url}`
  try {
    const urlObject = new URL(urlWithProtocol)

    const requestInit: RequestInit | undefined = options?.headers
      ? { headers: options.headers }
      : undefined

    const isSSE = urlObject.pathname.endsWith('/sse')
    if (isSSE) {
      return Result.ok(
        new SSEClientTransport(urlObject, {
          authProvider: options?.authProvider,
          requestInit,
        }),
      )
    }

    return Result.ok(
      new StreamableHTTPClientTransport(urlObject, {
        authProvider: options?.authProvider,
        requestInit,
      }),
    )
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
