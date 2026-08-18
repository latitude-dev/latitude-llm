import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Providers } from '@latitude-data/constants'
import type { JSONValue, LanguageModelV2 } from '@ai-sdk/provider'
import { type User } from '../../schema/models/types/User'
import { type Workspace } from '../../schema/models/types/Workspace'
import { Result } from '../../lib/Result'
import * as factories from '../../tests/factories'
import { createProvider as createProviderGlobal } from './helpers'

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
    vi.doMock('@ai-sdk/google-vertex', () => {
      return {
        createVertex: createVertexMock,
      }
    })

    const mod = await import('./helpers')
    const createProvider = mod.createProvider
    const result = createProvider({
      provider,
      apiKey: provider.token,
      url: undefined,
      config: { model: 'gemini-1.5-pro' },
    })

    expect(createVertexMock).toHaveBeenCalledWith({
      fetch: expect.any(Function),
      project: 'my-project',
      location: 'us-central1',
      googleCredentials: {
        clientEmail: 'my-email',
        privateKey: 'secret',
        privateKeyId: 'my-key-id',
      },
      googleAuthOptions: {
        credentials: {
          client_email: 'my-email',
          private_key: 'secret',
        },
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
    vi.doMock('@ai-sdk/google-vertex/anthropic', () => {
      return {
        createVertexAnthropic: createVertexMock,
      }
    })

    const mod = await import('./helpers')
    const createProvider = mod.createProvider
    const result = createProvider({
      provider,
      apiKey: provider.token,
      url: undefined,
      config: { model: 'gemini-1.5-pro' },
    })

    expect(createVertexMock).toHaveBeenCalledWith({
      fetch: expect.any(Function),
      project: 'my-project',
      location: 'us-central1',
      googleCredentials: {
        clientEmail: 'my-email',
        privateKey: 'super\\nsecret',
        privateKeyId: 'my-key-id',
      },
      googleAuthOptions: {
        credentials: {
          client_email: 'my-email',
          private_key: 'super\nsecret',
        },
      },
    })
    expect(result.value).toEqual('fake-vertex')
  })

  describe('azure prompt caching', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    async function captureAzureRequest(
      providerOptions: Record<string, JSONValue>,
    ) {
      const provider = await factories.createProviderApiKey({
        workspace,
        type: Providers.Azure,
        name: `my-azure-${Math.random()}`,
        user,
      })

      let request: { url: string; body: Record<string, unknown> } | undefined
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: unknown, init: { body?: unknown }) => {
          request = {
            url: String(url),
            body: JSON.parse(String(init?.body)),
          }

          return new Response(
            JSON.stringify({
              id: 'chatcmpl-1',
              object: 'chat.completion',
              created: 0,
              model: 'gpt-4.1',
              choices: [
                {
                  index: 0,
                  message: { role: 'assistant', content: 'Hi' },
                  finish_reason: 'stop',
                },
              ],
              usage: {
                prompt_tokens: 1,
                completion_tokens: 1,
                total_tokens: 2,
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          )
        }),
      )

      const llmProvider = createProviderGlobal({
        provider,
        apiKey: provider.token,
        url: undefined,
        config: { model: 'gpt-4.1', azure: { resourceName: 'my-resource' } },
      }).unwrap() as unknown as (model: string) => LanguageModelV2

      await llmProvider('gpt-4.1').doGenerate({
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
        providerOptions: { openai: providerOptions },
      })

      return request!
    }

    it('forwards the prompt cache attributes to the provider', async () => {
      const request = await captureAzureRequest({
        promptCacheKey: 'tenant:contoso:manual-v2',
        promptCacheRetention: '24h',
      })

      expect(request.body).toMatchObject({
        prompt_cache_key: 'tenant:contoso:manual-v2',
        prompt_cache_retention: '24h',
      })
    })

    it('keeps calling the preview api version by default', async () => {
      const request = await captureAzureRequest({})

      expect(request.url).toContain('api-version=preview')
    })
  })
})
