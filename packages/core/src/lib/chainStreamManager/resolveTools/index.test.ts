import { z } from 'zod'
import { describe, it, expect, beforeAll } from 'vitest'
import { PromptSource, Providers } from '../../../constants'
import * as factories from '../../../tests/factories'
import { ProviderApiKey, Workspace } from '../../../browser'
import { resolveToolsFromConfig } from '.'

describe('resolveTools', () => {
  let promptSource: PromptSource
  let workspace: Workspace
  let provider: ProviderApiKey
  beforeAll(async () => {
    const {
      commit: cmt,
      workspace: wp,
      documents: docs,
      providers,
    } = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        doc1: factories.helpers.createPrompt({
          provider: 'openai',
          content: 'content',
        }),
      },
    })

    workspace = wp
    provider = providers[0]!
    promptSource = { document: docs[0]!, commit: cmt }
  })

  it('resolves client tools and provider tools', async () => {
    const result = await resolveToolsFromConfig({
      workspace,
      promptSource,
      config: {
        provider: provider.name,
        model: 'gpt-4.1',
        tools: [
          {
            openai: [
              {
                type: 'web_search_preview',
                search_context_size: 'low',
              },
            ],
          },
          {
            get_weather: {
              description:
                'Obtains the weather temperature from a given location id.',
              parameters: {
                type: 'object',
                additionalProperties: false,
                required: ['location_id'],
                properties: {
                  location_id: {
                    type: 'number',
                    description: 'The id for the location.',
                  },
                },
              },
            },
          },
        ],
      },
      injectAgentFinishTool: false,
    })

    expect(result.value).toEqual({
      get_weather: {
        definition: {
          description:
            'Obtains the weather temperature from a given location id.',
          parameters: {
            additionalProperties: false,
            properties: {
              location_id: {
                description: 'The id for the location.',
                type: 'number',
              },
            },
            required: ['location_id'],
            type: 'object',
          },
        },
        sourceData: {
          source: 'client',
        },
      },
      web_search_preview: {
        definition: {
          type: 'provider-defined',
          id: 'openai.web_search_preview',
          args: {
            searchContextSize: 'low',
            userLocation: undefined,
          },
          parameters: expect.any(z.ZodObject),
        },
        sourceData: {
          provider: 'openai',
          source: 'providerTool',
        },
      },
    })
  })
})
