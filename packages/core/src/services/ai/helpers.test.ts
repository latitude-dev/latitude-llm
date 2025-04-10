import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as factories from '../../tests/factories'
import { Workspace, User, Providers } from '../../browser'
import { createProvider as createProviderGlobal } from './helpers'
import { Result } from '../../lib/Result'
import { RunErrorCodes } from '@latitude-data/constants/errors'
import { ChainError } from '../../lib/chainStreamManager/ChainErrors'

let workspace: Workspace
let user: User

describe('createProvider', () => {
  beforeEach(async () => {
    const { userData, workspace: w } = await factories.createWorkspace()

    user = userData
    workspace = w
    vi.resetModules()
  })

  it('returns error if vertex config is not provided', async () => {
    const provider = await factories.createProviderApiKey({
      workspace,
      type: Providers.GoogleVertex,
      name: 'my-google-vertex',
      user,
    })

    const result = createProviderGlobal({
      provider,
      messages: [],
      apiKey: provider.token,
      url: undefined,
      config: { model: 'gemini-1.5-pro' },
    })
    expect(result).toEqual(
      Result.error(
        new ChainError({
          code: RunErrorCodes.AIProviderConfigError,
          message:
            "Provider 'my-google-vertex' is not properly configured with all the Vertex required fields",
        }),
      ),
    )
  })

  it('returns vertex provider if config is provided', async () => {
    const provider = await factories.createProviderApiKey({
      workspace,
      type: Providers.GoogleVertex,
      name: 'my-google-vertex',
      user,
      configuration: {
        project: 'my-project',
        location: 'us-central1',
        googleCredentials: {
          clientEmail: 'my-email',
          privateKeyId: 'my-key-id',
          privateKey: 'secret',
        },
      },
    })
    const createVertexMock = vi.fn().mockReturnValue('fake-vertex')
    vi.doMock('@ai-sdk/google-vertex/edge', () => {
      return {
        createVertex: createVertexMock,
      }
    })

    const mod = await import('./helpers')
    const createProvider = mod.createProvider
    const result = createProvider({
      provider,
      messages: [],
      apiKey: provider.token,
      url: undefined,
      config: { model: 'gemini-1.5-pro' },
    })

    expect(createVertexMock).toHaveBeenCalledWith({
      project: 'my-project',
      location: 'us-central1',
      googleCredentials: {
        clientEmail: 'my-email',
        privateKey: 'secret',
        privateKeyId: 'my-key-id',
      },
    })
    expect(result.value).toEqual('fake-vertex')
  })

  it('returns vertex Anthropic provider if config is provided', async () => {
    const provider = await factories.createProviderApiKey({
      workspace,
      type: Providers.AnthropicVertex,
      name: 'my-anthropic-vertex',
      user,
      configuration: {
        project: 'my-project',
        location: 'us-central1',
        googleCredentials: {
          clientEmail: 'my-email',
          privateKeyId: 'my-key-id',
          privateKey: 'super\\nsecret',
        },
      },
    })
    const createVertexMock = vi.fn().mockReturnValue('fake-vertex')
    vi.doMock('@ai-sdk/google-vertex/anthropic/edge', () => {
      return {
        createVertexAnthropic: createVertexMock,
      }
    })

    const mod = await import('./helpers')
    const createProvider = mod.createProvider
    const result = createProvider({
      provider,
      messages: [],
      apiKey: provider.token,
      url: undefined,
      config: { model: 'gemini-1.5-pro' },
    })

    expect(createVertexMock).toHaveBeenCalledWith({
      project: 'my-project',
      location: 'us-central1',
      googleCredentials: {
        clientEmail: 'my-email',
        privateKey: 'super\nsecret',
        privateKeyId: 'my-key-id',
      },
    })
    expect(result.value).toEqual('fake-vertex')
  })
})
