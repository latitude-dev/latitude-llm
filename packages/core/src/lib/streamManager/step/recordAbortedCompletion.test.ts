import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Providers, VercelConfig } from '@latitude-data/constants'
import { Message } from '@latitude-data/constants/messages'
import * as telemetryModule from '../../../telemetry'
import { TelemetryContext } from '../../../telemetry'
import { ProviderApiKey } from '../../../schema/models/types/ProviderApiKey'
import { recordAbortedCompletion } from './recordAbortedCompletion'

function createMockContext(): TelemetryContext {
  return {} as TelemetryContext
}

function createMockProvider(provider: Providers): ProviderApiKey {
  return {
    provider,
    name: 'test-provider',
  } as ProviderApiKey
}

function createMockConfig(model: string): VercelConfig {
  return { model, provider: 'openai' } as VercelConfig
}

function createMockMessages(content: string): Message[] {
  return [{ role: 'user', content }] as unknown as Message[]
}

describe('recordAbortedCompletion', () => {
  const endMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(telemetryModule.telemetry.span, 'completion').mockReturnValue({
      end: endMock,
      context: {} as never,
      fail: vi.fn(),
    })
  })

  it('creates a completion span with provider info', () => {
    const context = createMockContext()
    const provider = createMockProvider(Providers.OpenAI)
    const config = createMockConfig('gpt-4o')
    const messages = createMockMessages('Hello')

    recordAbortedCompletion({
      context,
      provider,
      config,
      messages,
      accumulatedText: 'Partial response text',
      accumulatedReasoning: null,
    })

    expect(telemetryModule.telemetry.span.completion).toHaveBeenCalledWith(
      {
        provider: Providers.OpenAI,
        model: 'gpt-4o',
        input: messages,
        configuration: config,
      },
      context,
    )
  })

  it('ends the span with the accumulated text as output', () => {
    const context = createMockContext()
    const provider = createMockProvider(Providers.OpenAI)
    const config = createMockConfig('gpt-4o')
    const messages = createMockMessages('Hello')

    recordAbortedCompletion({
      context,
      provider,
      config,
      messages,
      accumulatedText: 'This is the partial response',
      accumulatedReasoning: null,
    })

    expect(endMock).toHaveBeenCalledWith({
      output: [
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'This is the partial response' }],
        },
      ],
      finishReason: 'stop',
      tokens: {},
    })
  })

  it('handles empty accumulated text', () => {
    const context = createMockContext()
    const provider = createMockProvider(Providers.Anthropic)
    const config = createMockConfig('claude-3')
    const messages = createMockMessages('Test')

    recordAbortedCompletion({
      context,
      provider,
      config,
      messages,
      accumulatedText: '',
      accumulatedReasoning: null,
    })

    expect(endMock).toHaveBeenCalledWith({
      output: [
        {
          role: 'assistant',
          content: [{ type: 'text', text: '' }],
        },
      ],
      finishReason: 'stop',
      tokens: {},
    })
  })

  it('handles complex accumulated text with newlines', () => {
    const context = createMockContext()
    const provider = createMockProvider(Providers.OpenAI)
    const config = createMockConfig('gpt-4o')
    const messages = createMockMessages('Write a poem')

    recordAbortedCompletion({
      context,
      provider,
      config,
      messages,
      accumulatedText: 'Roses are red,\nViolets are blue,\nThis poem was cut',
      accumulatedReasoning: null,
    })

    expect(endMock).toHaveBeenCalledWith({
      output: [
        {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'Roses are red,\nViolets are blue,\nThis poem was cut',
            },
          ],
        },
      ],
      finishReason: 'stop',
      tokens: {},
    })
  })

  it('includes reasoning content when accumulatedReasoning is provided', () => {
    const context = createMockContext()
    const provider = createMockProvider(Providers.OpenAI)
    const config = createMockConfig('gpt-4o')
    const messages = createMockMessages('Solve this problem')

    recordAbortedCompletion({
      context,
      provider,
      config,
      messages,
      accumulatedText: 'The answer is 42',
      accumulatedReasoning: 'Let me think step by step...',
    })

    expect(endMock).toHaveBeenCalledWith({
      output: [
        {
          role: 'assistant',
          content: [
            { type: 'reasoning', text: 'Let me think step by step...' },
            { type: 'text', text: 'The answer is 42' },
          ],
        },
      ],
      finishReason: 'stop',
      tokens: {},
    })
  })

  it('handles only reasoning without text', () => {
    const context = createMockContext()
    const provider = createMockProvider(Providers.OpenAI)
    const config = createMockConfig('gpt-4o')
    const messages = createMockMessages('Think about this')

    recordAbortedCompletion({
      context,
      provider,
      config,
      messages,
      accumulatedText: null,
      accumulatedReasoning: 'Hmm, this is interesting...',
    })

    expect(endMock).toHaveBeenCalledWith({
      output: [
        {
          role: 'assistant',
          content: [{ type: 'reasoning', text: 'Hmm, this is interesting...' }],
        },
      ],
      finishReason: 'stop',
      tokens: {},
    })
  })

  it('handles both text and reasoning as null', () => {
    const context = createMockContext()
    const provider = createMockProvider(Providers.OpenAI)
    const config = createMockConfig('gpt-4o')
    const messages = createMockMessages('Hello')

    recordAbortedCompletion({
      context,
      provider,
      config,
      messages,
      accumulatedText: null,
      accumulatedReasoning: null,
    })

    expect(endMock).toHaveBeenCalledWith({
      output: [
        {
          role: 'assistant',
          content: [],
        },
      ],
      finishReason: 'stop',
      tokens: {},
    })
  })
})
