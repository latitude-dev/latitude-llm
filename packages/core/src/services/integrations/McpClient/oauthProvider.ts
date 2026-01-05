import { OAuthClientProvider as McpOAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js'
import type {
  OAuthClientMetadata,
  OAuthClientInformation,
  OAuthTokens,
  OAuthClientInformationFull,
} from '@modelcontextprotocol/sdk/shared/auth.js'
import { McpOAuthCredentials } from '../../../schema/models/types/McpOAuthCredentials'
import { IntegrationDto } from '../../../schema/models/types/Integration'
import { database } from '../../../client'
import { mcpOAuthCredentials } from '../../../schema/models/mcpOAuthCredentials'
import { and, eq } from 'drizzle-orm'
import { encrypt, decrypt } from '../../../lib/encryption'

type DbConnection = typeof database

type OAuthTokensStore = {
  accessToken?: string
  refreshToken?: string
  expiresAt?: Date | null
}

function encryptIfPresent(value: string | undefined | null): string | null {
  if (!value) return null
  return encrypt(value)
}

function decryptIfPresent(
  value: string | undefined | null,
): string | undefined {
  if (!value) return undefined
  try {
    return decrypt(value)
  } catch {
    return value
  }
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
  private _authorId?: string
  private _clientInformation?: OAuthClientInformation
  private _tokens?: OAuthTokensStore
  private _codeVerifier?: string
  private _onRedirectToAuthorization?: (authorizationUrl: URL) => void

  constructor(options: {
    redirectUrl: string
    integration: IntegrationDto
    credentials?: McpOAuthCredentials | null
    authorId?: string
    onRedirectToAuthorization?: (authorizationUrl: URL) => void
  }) {
    this._redirectUrl = options.redirectUrl
    this._integrationId = options.integration.id
    this._workspaceId = options.integration.workspaceId
    this._authorId = options.authorId
    this._onRedirectToAuthorization = options.onRedirectToAuthorization

    this._clientMetadata = {
      redirect_uris: [options.redirectUrl],
      client_name: options.integration.name,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'client_secret_post',
    }

    if (options.credentials) {
      if (options.credentials.clientId) {
        this._clientInformation = {
          client_id: options.credentials.clientId,
          client_secret: decryptIfPresent(options.credentials.clientSecret),
        }
      }
      if (options.credentials.accessToken) {
        this._tokens = {
          accessToken: decryptIfPresent(options.credentials.accessToken),
          refreshToken: decryptIfPresent(options.credentials.refreshToken),
          expiresAt: options.credentials.tokenExpiresAt,
        }
      }
      if (options.credentials.codeVerifier) {
        this._codeVerifier = decryptIfPresent(options.credentials.codeVerifier)
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
        workspaceId: this._workspaceId,
        integrationId: this._integrationId,
        authorId: this._authorId,
        clientId: clientInformation.client_id,
        clientSecret: encryptIfPresent(clientInformation.client_secret),
      })
      .onConflictDoUpdate({
        target: mcpOAuthCredentials.integrationId,
        set: {
          authorId: this._authorId,
          clientId: clientInformation.client_id,
          clientSecret: encryptIfPresent(clientInformation.client_secret),
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
        ? Math.floor((this._tokens.expiresAt.getTime() - Date.now()) / 1000)
        : undefined,
    }
  }

  async saveTokens(tokens: OAuthTokens, db: DbConnection = database): Promise<void> {
    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null
    this._tokens = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
    }
    await db
      .insert(mcpOAuthCredentials)
      .values({
        workspaceId: this._workspaceId,
        integrationId: this._integrationId,
        authorId: this._authorId,
        accessToken: encryptIfPresent(tokens.access_token),
        refreshToken: encryptIfPresent(tokens.refresh_token),
        tokenExpiresAt: expiresAt,
      })
      .onConflictDoUpdate({
        target: mcpOAuthCredentials.integrationId,
        set: {
          authorId: this._authorId,
          accessToken: encryptIfPresent(tokens.access_token),
          refreshToken: encryptIfPresent(tokens.refresh_token),
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
        workspaceId: this._workspaceId,
        integrationId: this._integrationId,
        authorId: this._authorId,
        codeVerifier: encryptIfPresent(codeVerifier),
      })
      .onConflictDoUpdate({
        target: mcpOAuthCredentials.integrationId,
        set: {
          authorId: this._authorId,
          codeVerifier: encryptIfPresent(codeVerifier),
          updatedAt: new Date(),
        },
      })
  }

  codeVerifier(): string {
    if (!this._codeVerifier) {
      throw new Error(
        'No code verifier saved. This may indicate the OAuth flow was interrupted or the authorization was started from a different session.',
      )
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
  workspaceId: number,
  integrationId: number,
): Promise<McpOAuthCredentials | null> {
  const result = await database
    .select()
    .from(mcpOAuthCredentials)
    .where(
      and(
        eq(mcpOAuthCredentials.workspaceId, workspaceId),
        eq(mcpOAuthCredentials.integrationId, integrationId),
      ),
    )
    .limit(1)
  return result[0] ?? null
}
