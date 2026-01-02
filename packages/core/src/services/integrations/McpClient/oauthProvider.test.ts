import { beforeEach, describe, expect, it } from 'vitest'
import { IntegrationDto } from '../../../schema/models/types/Integration'
import { type Workspace } from '../../../schema/models/types/Workspace'
import { IntegrationType } from '@latitude-data/constants'
import * as factories from '../../../tests/factories'
import {
  McpOAuthProvider,
  getMcpOAuthCredentials,
} from './oauthProvider'
import { database } from '../../../client'
import { mcpOAuthCredentials } from '../../../schema/models/mcpOAuthCredentials'

describe('McpOAuthProvider', () => {
  let workspace: Workspace
  let integration: IntegrationDto

  beforeEach(async () => {
    const { workspace: createdWorkspace } = await factories.createWorkspace()
    workspace = createdWorkspace

    integration = await factories.createIntegration({
      workspace,
      name: 'TestOAuthMCP',
      type: IntegrationType.ExternalMCP,
      configuration: {
        url: 'https://example.com/mcp',
        useOAuth: true,
        oauth: {
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
          scope: 'mcp:tools',
        },
      },
    })
  })

  it('should create provider with correct redirect URL', () => {
    const provider = new McpOAuthProvider({
      redirectUrl: 'https://app.example.com/callback',
      integration,
      credentials: null,
    })

    expect(provider.redirectUrl).toBe('https://app.example.com/callback')
  })

  it('should create provider with correct client metadata', () => {
    const provider = new McpOAuthProvider({
      redirectUrl: 'https://app.example.com/callback',
      integration,
      credentials: null,
    })

    const metadata = provider.clientMetadata
    expect(metadata.redirect_uris).toEqual(['https://app.example.com/callback'])
    expect(metadata.client_name).toBe('TestOAuthMCP')
    expect(metadata.grant_types).toContain('authorization_code')
    expect(metadata.grant_types).toContain('refresh_token')
    expect(metadata.scope).toBe('mcp:tools')
  })

  it('should generate state parameter with integration and workspace IDs', () => {
    const provider = new McpOAuthProvider({
      redirectUrl: 'https://app.example.com/callback',
      integration,
      credentials: null,
    })

    const state = provider.state()
    const decoded = JSON.parse(Buffer.from(state, 'base64').toString('utf-8'))

    expect(decoded.integrationId).toBe(integration.id)
    expect(decoded.workspaceId).toBe(workspace.id)
  })

  it('should save and retrieve tokens', async () => {
    const provider = new McpOAuthProvider({
      redirectUrl: 'https://app.example.com/callback',
      integration,
      credentials: null,
    })

    expect(provider.tokens()).toBeUndefined()

    await provider.saveTokens({
      access_token: 'test-access-token',
      token_type: 'Bearer',
      refresh_token: 'test-refresh-token',
      expires_in: 3600,
    })

    const tokens = provider.tokens()
    expect(tokens).toBeDefined()
    expect(tokens?.access_token).toBe('test-access-token')
    expect(tokens?.refresh_token).toBe('test-refresh-token')

    const storedCredentials = await getMcpOAuthCredentials(integration.id)
    expect(storedCredentials).toBeDefined()
    expect(storedCredentials?.accessToken).toBe('test-access-token')
    expect(storedCredentials?.refreshToken).toBe('test-refresh-token')
  })

  it('should save and retrieve code verifier', async () => {
    const provider = new McpOAuthProvider({
      redirectUrl: 'https://app.example.com/callback',
      integration,
      credentials: null,
    })

    await provider.saveCodeVerifier('test-code-verifier')

    expect(provider.codeVerifier()).toBe('test-code-verifier')

    const storedCredentials = await getMcpOAuthCredentials(integration.id)
    expect(storedCredentials?.codeVerifier).toBe('test-code-verifier')
  })

  it('should load existing credentials from constructor', async () => {
    await database.insert(mcpOAuthCredentials).values({
      integrationId: integration.id,
      clientId: 'stored-client-id',
      clientSecret: 'stored-client-secret',
      accessToken: 'stored-access-token',
      refreshToken: 'stored-refresh-token',
      codeVerifier: 'stored-code-verifier',
    })

    const credentials = await getMcpOAuthCredentials(integration.id)
    const provider = new McpOAuthProvider({
      redirectUrl: 'https://app.example.com/callback',
      integration,
      credentials,
    })

    const clientInfo = provider.clientInformation()
    expect(clientInfo?.client_id).toBe('stored-client-id')
    expect(clientInfo?.client_secret).toBe('stored-client-secret')

    const tokens = provider.tokens()
    expect(tokens?.access_token).toBe('stored-access-token')
    expect(tokens?.refresh_token).toBe('stored-refresh-token')

    expect(provider.codeVerifier()).toBe('stored-code-verifier')
  })

  it('should call onRedirectToAuthorization callback', () => {
    let capturedUrl: URL | null = null

    const provider = new McpOAuthProvider({
      redirectUrl: 'https://app.example.com/callback',
      integration,
      credentials: null,
      onRedirectToAuthorization: (url) => {
        capturedUrl = url
      },
    })

    const testUrl = new URL('https://auth.example.com/authorize?client_id=test')
    provider.redirectToAuthorization(testUrl)

    expect(capturedUrl).toEqual(testUrl)
  })
})

describe('getMcpOAuthCredentials', () => {
  let workspace: Workspace
  let integration: IntegrationDto

  beforeEach(async () => {
    const { workspace: createdWorkspace } = await factories.createWorkspace()
    workspace = createdWorkspace

    integration = await factories.createIntegration({
      workspace,
      name: 'TestMCP',
      type: IntegrationType.ExternalMCP,
      configuration: {
        url: 'https://example.com/mcp',
      },
    })
  })

  it('should return null when no credentials exist', async () => {
    const credentials = await getMcpOAuthCredentials(integration.id)
    expect(credentials).toBeNull()
  })

  it('should return credentials when they exist', async () => {
    await database.insert(mcpOAuthCredentials).values({
      integrationId: integration.id,
      accessToken: 'test-token',
    })

    const credentials = await getMcpOAuthCredentials(integration.id)
    expect(credentials).toBeDefined()
    expect(credentials?.accessToken).toBe('test-token')
  })
})
