import { OAuthClientProvider as McpOAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js'
import type {
  OAuthClientMetadata,
  OAuthClientInformation,
  OAuthTokens,
  OAuthClientInformationFull,
} from '@modelcontextprotocol/sdk/shared/auth.js'
import { McpOAuthCredentials } from '../../../schema/models/types/McpOAuthCredentials'
import { IntegrationDto } from '../../../schema/models/types/Integration'
import { IntegrationType } from '@latitude-data/constants'
import { database } from '../../../client'
import { mcpOAuthCredentials } from '../../../schema/models/mcpOAuthCredentials'
import { eq } from 'drizzle-orm'

type OAuthTokensStore = {
  accessToken?: string
  refreshToken?: string
  expiresAt?: Date | null
}

/**
 * OAuth client provider for MCP servers that implements the MCP SDK's OAuthClientProvider interface.
 * This provider manages OAuth tokens and handles the authorization flow for external MCP servers.
 */
export class McpOAuthProvider implements McpOAuthClientProvider {
  private _redirectUrl: string
  private _clientMetadata: OAuthClientMetadata
  private _integrationId: number
  private _workspaceId: number
  private _clientInformation?: OAuthClientInformation
  private _tokens?: OAuthTokensStore
  private _codeVerifier?: string
  private _onRedirectToAuthorization?: (authorizationUrl: URL) => void

  constructor(options: {
    redirectUrl: string
    integration: IntegrationDto
    credentials?: McpOAuthCredentials | null
    onRedirectToAuthorization?: (authorizationUrl: URL) => void
  }) {
    this._redirectUrl = options.redirectUrl
    this._integrationId = options.integration.id
    this._workspaceId = options.integration.workspaceId
    this._onRedirectToAuthorization = options.onRedirectToAuthorization

    const oauthConfig =
      options.integration.type === IntegrationType.ExternalMCP
        ? options.integration.configuration.oauth
        : undefined

    this._clientMetadata = {
      redirect_uris: [options.redirectUrl],
      client_name: oauthConfig?.clientName ?? options.integration.name,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'client_secret_post',
      scope: oauthConfig?.scope,
    }

    if (options.credentials) {
      if (options.credentials.clientId) {
        this._clientInformation = {
          client_id: options.credentials.clientId,
          client_secret: options.credentials.clientSecret ?? undefined,
        }
      }
      if (options.credentials.accessToken) {
        this._tokens = {
          accessToken: options.credentials.accessToken,
          refreshToken: options.credentials.refreshToken ?? undefined,
          expiresAt: options.credentials.tokenExpiresAt,
        }
      }
      if (options.credentials.codeVerifier) {
        this._codeVerifier = options.credentials.codeVerifier
      }
    }
  }

  get redirectUrl(): string {
    return this._redirectUrl
  }

  get clientMetadata(): OAuthClientMetadata {
    return this._clientMetadata
  }

  /**
   * Returns a state parameter that encodes the integration and workspace IDs.
   * This is used to identify the integration when the OAuth callback is received.
   */
  state(): string {
    const stateData = {
      integrationId: this._integrationId,
      workspaceId: this._workspaceId,
    }
    return Buffer.from(JSON.stringify(stateData)).toString('base64')
  }

  clientInformation(): OAuthClientInformation | undefined {
    return this._clientInformation
  }

  async saveClientInformation(
    clientInformation: OAuthClientInformationFull,
  ): Promise<void> {
    this._clientInformation = clientInformation
    await database
      .insert(mcpOAuthCredentials)
      .values({
        integrationId: this._integrationId,
        clientId: clientInformation.client_id,
        clientSecret: clientInformation.client_secret,
      })
      .onConflictDoUpdate({
        target: mcpOAuthCredentials.integrationId,
        set: {
          clientId: clientInformation.client_id,
          clientSecret: clientInformation.client_secret,
          updatedAt: new Date(),
        },
      })
  }

  tokens(): OAuthTokens | undefined {
    if (!this._tokens?.accessToken) return undefined
    return {
      access_token: this._tokens.accessToken,
      token_type: 'Bearer',
      refresh_token: this._tokens.refreshToken,
      expires_in: this._tokens.expiresAt
        ? Math.floor(
            (this._tokens.expiresAt.getTime() - Date.now()) / 1000,
          )
        : undefined,
    }
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null
    this._tokens = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
    }
    await database
      .insert(mcpOAuthCredentials)
      .values({
        integrationId: this._integrationId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt: expiresAt,
      })
      .onConflictDoUpdate({
        target: mcpOAuthCredentials.integrationId,
        set: {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          tokenExpiresAt: expiresAt,
          updatedAt: new Date(),
        },
      })
  }

  redirectToAuthorization(authorizationUrl: URL): void {
    if (this._onRedirectToAuthorization) {
      this._onRedirectToAuthorization(authorizationUrl)
    }
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    this._codeVerifier = codeVerifier
    await database
      .insert(mcpOAuthCredentials)
      .values({
        integrationId: this._integrationId,
        codeVerifier,
      })
      .onConflictDoUpdate({
        target: mcpOAuthCredentials.integrationId,
        set: {
          codeVerifier,
          updatedAt: new Date(),
        },
      })
  }

  codeVerifier(): string {
    if (!this._codeVerifier) {
      throw new Error('No code verifier saved')
    }
    return this._codeVerifier
  }

  get integrationId(): number {
    return this._integrationId
  }
}

/**
 * Retrieves OAuth credentials for an integration from the database.
 */
export async function getMcpOAuthCredentials(
  integrationId: number,
): Promise<McpOAuthCredentials | null> {
  const result = await database
    .select()
    .from(mcpOAuthCredentials)
    .where(eq(mcpOAuthCredentials.integrationId, integrationId))
    .limit(1)
  return result[0] ?? null
}
