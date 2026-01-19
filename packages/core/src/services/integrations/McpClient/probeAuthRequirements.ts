import { Result, TypedResult } from '../../../lib/Result'
import { LatitudeError } from '../../../lib/errors'

export type AuthRequirements = {
  requiresOAuth: boolean
  requiresApiKey: boolean
  authServerUrl?: string
}

const PROBE_TIMEOUT_MS = 5000

/**
 * Probes an MCP server to detect its authentication requirements.
 *
 * This makes a GET request to the server and inspects the response:
 * - If 401 with WWW-Authenticate header containing "Bearer" and resource_metadata, OAuth is required
 * - If 401 without OAuth indicators, API key authentication may be required
 * - If 200 or other success, no authentication is required
 */
export async function probeAuthRequirements(
  url: string,
): Promise<TypedResult<AuthRequirements, LatitudeError>> {
  const urlWithProtocol = url.match(/^https?:\/\//) ? url : `https://${url}`

  try {
    const serverUrl = new URL(urlWithProtocol)

    // SSE endpoints hold connections open for streaming, so we can't probe them directly.
    // SSE transport doesn't support OAuth anyway - it's only for Streamable HTTP transport.
    if (serverUrl.pathname.endsWith('/sse')) {
      return Result.ok({
        requiresOAuth: false,
        requiresApiKey: false,
      })
    }
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)

    const response = await fetch(serverUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (response.status === 401) {
      const wwwAuth = response.headers.get('WWW-Authenticate')

      if (wwwAuth) {
        // Check for OAuth indicators in WWW-Authenticate header
        const hasBearer = wwwAuth.toLowerCase().includes('bearer')
        const resourceMetadataMatch = /resource_metadata="([^"]*)"/.exec(
          wwwAuth,
        )

        if (hasBearer || resourceMetadataMatch) {
          return Result.ok({
            requiresOAuth: true,
            requiresApiKey: false,
            authServerUrl: resourceMetadataMatch?.[1],
          })
        }
      }

      // 401 without OAuth indicators - likely needs API key
      return Result.ok({
        requiresOAuth: false,
        requiresApiKey: true,
      })
    }

    // Server responded successfully or with non-auth error
    return Result.ok({
      requiresOAuth: false,
      requiresApiKey: false,
    })
  } catch (err) {
    // Network error or invalid URL - can't determine auth requirements
    const message =
      err instanceof Error ? err.message : 'Failed to probe server'
    return Result.error(
      new LatitudeError(`Failed to probe MCP server: ${message}`),
    )
  }
}
