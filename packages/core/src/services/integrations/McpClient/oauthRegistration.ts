import { IntegrationDto } from '../../../schema/models/types/Integration'
import { IntegrationType } from '@latitude-data/constants'
import { Result, TypedResult } from '../../../lib/Result'
import { LatitudeError, BadRequestError } from '../../../lib/errors'
import { env } from '@latitude-data/env'
import { API_ROUTES } from '../../../constants'
import { McpOAuthProvider } from './oauthProvider'
import crypto from 'crypto'
import {
  discoverOAuthMetadata,
  discoverOAuthProtectedResourceMetadata,
} from '@modelcontextprotocol/sdk/client/auth.js'
// Note: We don't use the SDK's startAuthorization/registerClient because they
// use `new URL("/path", baseUrl)` which replaces the path. Some servers like
// Smithery use path-based routing where endpoints are at `baseUrl/path`.
import type {
  OAuthClientMetadata,
  OAuthClientInformationFull,
  OAuthClientInformation,
  OAuthMetadata,
} from '@modelcontextprotocol/sdk/shared/auth.js'
import { OAuthClientInformationFullSchema } from '@modelcontextprotocol/sdk/shared/auth.js'

type InitiateOAuthParams = {
  integration: IntegrationDto
  authorId: string
}

/**
 * Builds a URL by appending a path segment to an existing URL's path.
 * Unlike `new URL("/path", baseUrl)` which replaces the path, this appends to it.
 * This is needed for servers like Smithery that use path-based routing.
 */
function buildPathBasedUrl(baseUrl: URL, pathSegment: string): URL {
  const basePath = baseUrl.pathname.replace(/\/$/, '')
  return new URL(`${basePath}/${pathSegment}`, baseUrl.origin)
}

/**
 * Generates a PKCE (Proof Key for Code Exchange) challenge.
 * Returns a code_verifier (random string) and code_challenge (SHA256 hash of verifier).
 */
function generatePkceChallenge(): {
  code_verifier: string
  code_challenge: string
} {
  // Generate a random 32-byte code verifier and encode as base64url
  const verifierBytes = crypto.randomBytes(32)
  const code_verifier = verifierBytes
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')

  // Generate SHA256 hash of verifier and encode as base64url
  const challengeBytes = crypto
    .createHash('sha256')
    .update(code_verifier)
    .digest()
  const code_challenge = challengeBytes
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')

  return { code_verifier, code_challenge }
}

/**
 * Custom client registration that handles path-based authorization servers.
 * The MCP SDK's registerClient uses `new URL("/register", baseUrl)` which
 * replaces the path. Some servers (like Smithery) use path-based routing
 * where the registration endpoint is at `baseUrl/register` not `/register`.
 */
async function registerClientWithPathSupport(
  authorizationServerUrl: URL,
  {
    metadata,
    clientMetadata,
  }: {
    metadata: OAuthMetadata | undefined
    clientMetadata: OAuthClientMetadata
  },
): Promise<OAuthClientInformationFull> {
  let registrationUrl: URL

  if (metadata?.registration_endpoint) {
    registrationUrl = new URL(metadata.registration_endpoint)
  } else {
    registrationUrl = buildPathBasedUrl(authorizationServerUrl, 'register')
  }

  const response = await fetch(registrationUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(clientMetadata),
  })

  if (!response.ok) {
    throw new Error(
      `Dynamic client registration failed: HTTP ${response.status}`,
    )
  }

  return OAuthClientInformationFullSchema.parse(await response.json())
}

/**
 * Custom authorization start that handles path-based authorization servers.
 * The MCP SDK's startAuthorization uses `new URL("/authorize", baseUrl)` which
 * replaces the path. Some servers use path-based routing where the authorize
 * endpoint is at `baseUrl/authorize` not `/authorize`.
 */
function startAuthorizationWithPathSupport(
  authorizationServerUrl: URL,
  {
    metadata,
    clientInformation,
    redirectUrl,
    scope,
  }: {
    metadata: OAuthMetadata | undefined
    clientInformation: OAuthClientInformation
    redirectUrl: string
    scope?: string
  },
): { authorizationUrl: URL; codeVerifier: string } {
  const responseType = 'code'
  const codeChallengeMethod = 'S256'

  let authorizationUrl: URL
  if (metadata?.authorization_endpoint) {
    authorizationUrl = new URL(metadata.authorization_endpoint)
  } else {
    authorizationUrl = buildPathBasedUrl(authorizationServerUrl, 'authorize')
  }

  // Generate PKCE challenge
  const { code_verifier: codeVerifier, code_challenge: codeChallenge } =
    generatePkceChallenge()

  authorizationUrl.searchParams.set('response_type', responseType)
  authorizationUrl.searchParams.set('client_id', clientInformation.client_id)
  authorizationUrl.searchParams.set('code_challenge', codeChallenge)
  authorizationUrl.searchParams.set(
    'code_challenge_method',
    codeChallengeMethod,
  )
  authorizationUrl.searchParams.set('redirect_uri', redirectUrl)

  if (scope) {
    authorizationUrl.searchParams.set('scope', scope)
  }

  return { authorizationUrl, codeVerifier }
}

/**
 * Initiates OAuth dynamic client registration for an external MCP integration.
 * This should be called when creating an integration with OAuth enabled.
 * Returns the authorization URL that the user should be redirected to.
 *
 * The OAuth flow follows RFC 9728 (Protected Resource Metadata) and RFC 8414
 * (Authorization Server Metadata):
 * 1. First, discover protected resource metadata to find the authorization server
 * 2. Then, discover authorization server metadata (or use fallback endpoints)
 * 3. Register the client dynamically if needed
 * 4. Generate the authorization URL with PKCE
 */
export async function initiateOAuthRegistration(
  params: InitiateOAuthParams,
): Promise<TypedResult<string, LatitudeError>> {
  const { integration, authorId } = params

  if (integration.type !== IntegrationType.ExternalMCP) {
    return Result.error(
      new BadRequestError('Integration type does not support OAuth'),
    )
  }

  const url = integration.configuration.url
  const urlWithProtocol = url.match(/^https?:\/\//) ? url : `https://${url}`
  const serverUrl = new URL(urlWithProtocol)

  const redirectUrl = `${env.APP_URL}${API_ROUTES.integrations.oauth.callback}`
  const oauthProvider = new McpOAuthProvider({
    redirectUrl,
    integration,
    credentials: null,
    authorId,
  })

  try {
    let authorizationServerUrl: URL = serverUrl
    let resourceMetadataUrl: URL | undefined

    // Step 1: Try to discover protected resource metadata (RFC 9728)
    // This tells us where the authorization server is located
    try {
      // First, make a request to the server to get the resource_metadata URL from WWW-Authenticate header
      const probeResponse = await fetch(serverUrl, { method: 'GET' })
      if (probeResponse.status === 401) {
        const wwwAuth = probeResponse.headers.get('WWW-Authenticate')
        if (wwwAuth) {
          const match = /resource_metadata="([^"]*)"/.exec(wwwAuth)
          if (match) {
            resourceMetadataUrl = new URL(match[1])
          }
        }
      }

      const resourceMetadata = await discoverOAuthProtectedResourceMetadata(
        serverUrl,
        { resourceMetadataUrl },
      )
      if (
        resourceMetadata.authorization_servers &&
        resourceMetadata.authorization_servers.length > 0
      ) {
        authorizationServerUrl = new URL(
          resourceMetadata.authorization_servers[0]!,
        )
      }
    } catch {
      // Protected resource metadata not available, continue with server URL as auth server
    }

    // Step 2: Discover authorization server metadata (RFC 8414)
    // This is optional - we can use fallback endpoints if not available
    const metadata = await discoverOAuthMetadata(authorizationServerUrl)

    // Step 3: Register the client dynamically (RFC 7591) if we don't have client info
    let clientInformation = oauthProvider.clientInformation()
    if (!clientInformation) {
      // Use our custom registration that handles path-based auth servers
      const fullClientInfo = await registerClientWithPathSupport(
        authorizationServerUrl,
        {
          metadata,
          clientMetadata: oauthProvider.clientMetadata,
        },
      )
      await oauthProvider.saveClientInformation(fullClientInfo)
      clientInformation = fullClientInfo
    }

    // Step 4: Start the authorization flow with PKCE
    const { authorizationUrl, codeVerifier } =
      await startAuthorizationWithPathSupport(authorizationServerUrl, {
        metadata,
        clientInformation,
        redirectUrl,
        scope: oauthProvider.clientMetadata.scope,
      })

    // Save the code verifier for the token exchange step
    await oauthProvider.saveCodeVerifier(codeVerifier)

    // Add our state parameter for identifying the integration on callback
    const state = oauthProvider.state()
    authorizationUrl.searchParams.set('state', state)

    return Result.ok(authorizationUrl.toString())
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to initiate OAuth'
    return Result.error(
      new LatitudeError(
        `Failed to initiate OAuth registration for MCP server at ${serverUrl.host}: ${message}`,
      ),
    )
  }
}
