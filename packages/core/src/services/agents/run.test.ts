import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runAgent } from './run'
import { ChainEventTypes } from '@latitude-data/constants'
import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'
import { ErrorableEntity } from '../../constants'

vi.mock('uuid')

vi.mock('../../lib/generateUUID', () => ({
  generateUUIDIdentifier: vi.fn(() => 'mock-uuid'),
}))

const mockedRunChain = vi.hoisted(() => vi.fn())
vi.mock('../chains/run', () => ({
  runChain: mockedRunChain,
}))

function makeChainResult(
  events: any[] = [],
  conversationConfig = {},
  messages = [],
) {
  return {
    stream: {
      getReader: () => {
        let i = 0
        return {
          read: async () => {
            if (i < events.length) {
              return { done: false, value: events[i++] }
            }
            return { done: true, value: undefined }
          },
        }
      },
    },
    conversation: Promise.resolve({ config: conversationConfig }),
    messages: Promise.resolve(messages),
    rawText: 'some raw text',
  }
}

describe('runAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns a ChainError when prompt compilation fails', async () => {
    const chainError = new ChainError({
      message: 'Prompt failed',
      code: RunErrorCodes.ChainCompileError,
    })

    mockedRunChain.mockReturnValueOnce(
      makeChainResult([
        { data: { type: ChainEventTypes.ChainError, error: chainError } },
      ]),
    )

    const result = runAgent({
      workspace: {},
      providersMap: {},
      source: {},
      promptlVersion: '1',
      chain: {},
      globalConfig: {},
      errorableType: ErrorableEntity.DocumentLog,
      messages: [],
      newMessages: [],
      generateUUID: () => '12345678-1234-1234-1234-123456789012',
    } as any)
    const error = await result.error

    expect(error).toBeInstanceOf(ChainError)
  })
})
