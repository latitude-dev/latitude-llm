import { describe, expect, it, vi } from 'vitest'
import {
  createStreamConsumer,
  buildOutputMessages,
  extractGenerateResultContent,
  CapturedStreamResult,
} from './streamConsumer'

describe('createStreamConsumer', () => {
  function createMockStream(chunks: unknown[]) {
    return new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(chunk)
        }
        controller.close()
      },
    })
  }

  async function consumeStream(stream: ReadableStream) {
    const reader = stream.getReader()
    const chunks: unknown[] = []
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
    }
    return chunks
  }

  it('captures text-delta chunks', async () => {
    const onConsumed = vi.fn()
    const mockChunks = [
      { type: 'text-delta', delta: 'Hello, ' },
      { type: 'text-delta', delta: 'world!' },
      { type: 'finish', finishReason: 'stop', usage: { inputTokens: 10, outputTokens: 5 } },
    ]

    const stream = createMockStream(mockChunks)
    const wrappedStream = stream.pipeThrough(createStreamConsumer(onConsumed))
    const consumedChunks = await consumeStream(wrappedStream)

    expect(consumedChunks).toEqual(mockChunks)
    expect(onConsumed).toHaveBeenCalledWith({
      text: 'Hello, world!',
      reasoning: '',
      files: [],
      toolCalls: [],
      finishReason: 'stop',
      tokens: {
        prompt: 10,
        completion: 5,
        cached: undefined,
        reasoning: undefined,
      },
    })
  })

  it('captures reasoning chunks', async () => {
    const onConsumed = vi.fn()
    const mockChunks = [
      { type: 'reasoning-delta', delta: 'Let me think...' },
      { type: 'reasoning-delta', delta: ' I should respond with hello.' },
      { type: 'text-delta', delta: 'Hello!' },
      { type: 'finish', finishReason: 'stop', usage: { inputTokens: 10, outputTokens: 8 } },
    ]

    const stream = createMockStream(mockChunks)
    const wrappedStream = stream.pipeThrough(createStreamConsumer(onConsumed))
    await consumeStream(wrappedStream)

    expect(onConsumed).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Hello!',
        reasoning: 'Let me think... I should respond with hello.',
        files: [],
      }),
    )
  })

  it('captures tool-call chunks', async () => {
    const onConsumed = vi.fn()
    const mockChunks = [
      { type: 'text-delta', delta: 'Let me search...' },
      {
        type: 'tool-call',
        toolCallId: 'call-123',
        toolName: 'web_search',
        input: { query: 'latest news' },
      },
      {
        type: 'tool-call',
        toolCallId: 'call-456',
        toolName: 'calculator',
        input: { expression: '2 + 2' },
      },
      { type: 'finish', finishReason: 'tool-calls', usage: { inputTokens: 15, outputTokens: 10 } },
    ]

    const stream = createMockStream(mockChunks)
    const wrappedStream = stream.pipeThrough(createStreamConsumer(onConsumed))
    await consumeStream(wrappedStream)

    expect(onConsumed).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Let me search...',
        files: [],
        toolCalls: [
          {
            type: 'tool-call',
            toolCallId: 'call-123',
            toolName: 'web_search',
            args: { query: 'latest news' },
          },
          {
            type: 'tool-call',
            toolCallId: 'call-456',
            toolName: 'calculator',
            args: { expression: '2 + 2' },
          },
        ],
        finishReason: 'tool-calls',
      }),
    )
  })

  it('captures cached and reasoning tokens', async () => {
    const onConsumed = vi.fn()
    const mockChunks = [
      { type: 'text-delta', delta: 'Hello' },
      {
        type: 'finish',
        finishReason: 'stop',
        usage: {
          inputTokens: 10,
          outputTokens: 5,
          cachedInputTokens: 8,
          reasoningTokens: 3,
        },
      },
    ]

    const stream = createMockStream(mockChunks)
    const wrappedStream = stream.pipeThrough(createStreamConsumer(onConsumed))
    await consumeStream(wrappedStream)

    expect(onConsumed).toHaveBeenCalledWith(
      expect.objectContaining({
        files: [],
        tokens: {
          prompt: 10,
          completion: 5,
          cached: 8,
          reasoning: 3,
        },
      }),
    )
  })

  it('defaults finishReason to unknown when no finish chunk', async () => {
    const onConsumed = vi.fn()
    const mockChunks = [{ type: 'text-delta', delta: 'Hello' }]

    const stream = createMockStream(mockChunks)
    const wrappedStream = stream.pipeThrough(createStreamConsumer(onConsumed))
    await consumeStream(wrappedStream)

    expect(onConsumed).toHaveBeenCalledWith(
      expect.objectContaining({
        files: [],
        finishReason: 'unknown',
      }),
    )
  })

  it('ignores unknown chunk types', async () => {
    const onConsumed = vi.fn()
    const mockChunks = [
      { type: 'unknown-type', data: 'whatever' },
      { type: 'text-delta', delta: 'Hello' },
      { type: 'another-unknown', foo: 'bar' },
      { type: 'finish', finishReason: 'stop', usage: {} },
    ]

    const stream = createMockStream(mockChunks)
    const wrappedStream = stream.pipeThrough(createStreamConsumer(onConsumed))
    const consumedChunks = await consumeStream(wrappedStream)

    expect(consumedChunks).toEqual(mockChunks)
    expect(onConsumed).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Hello',
        files: [],
      }),
    )
  })

  it('captures file chunks', async () => {
    const onConsumed = vi.fn()
    const imageData = new Uint8Array([1, 2, 3, 4])
    const pdfData = new ArrayBuffer(8)
    const mockChunks = [
      { type: 'text-delta', delta: 'Here is an image: ' },
      {
        type: 'file',
        mediaType: 'image/png',
        data: imageData,
      },
      { type: 'text-delta', delta: ' and a PDF: ' },
      {
        type: 'file',
        mediaType: 'application/pdf',
        data: pdfData,
      },
      { type: 'finish', finishReason: 'stop', usage: { inputTokens: 10, outputTokens: 5 } },
    ]

    const stream = createMockStream(mockChunks)
    const wrappedStream = stream.pipeThrough(createStreamConsumer(onConsumed))
    await consumeStream(wrappedStream)

    expect(onConsumed).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Here is an image:  and a PDF: ',
        files: [
          {
            type: 'file',
            mediaType: 'image/png',
            data: imageData,
          },
          {
            type: 'file',
            mediaType: 'application/pdf',
            data: pdfData,
          },
        ],
      }),
    )
  })
})

describe('buildOutputMessages', () => {
  it('builds message with text content', () => {
    const result: CapturedStreamResult = {
      text: 'Hello, world!',
      reasoning: '',
      files: [],
      toolCalls: [],
      finishReason: 'stop',
      tokens: { prompt: 10, completion: 5 },
    }

    const messages = buildOutputMessages(result)

    expect(messages).toEqual([
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello, world!' }],
        toolCalls: [],
      },
    ])
  })

  it('builds message with text and reasoning', () => {
    const result: CapturedStreamResult = {
      text: 'The answer is 42.',
      reasoning: 'Let me calculate...',
      files: [],
      toolCalls: [],
      finishReason: 'stop',
      tokens: { prompt: 10, completion: 15 },
    }

    const messages = buildOutputMessages(result)

    expect(messages).toEqual([
      {
        role: 'assistant',
        content: [
          { type: 'reasoning', text: 'Let me calculate...' },
          { type: 'text', text: 'The answer is 42.' },
        ],
        toolCalls: [],
      },
    ])
  })

  it('builds message with tool calls', () => {
    const result: CapturedStreamResult = {
      text: 'I will search for that.',
      reasoning: '',
      files: [],
      toolCalls: [
        {
          type: 'tool-call',
          toolCallId: 'call-123',
          toolName: 'web_search',
          args: { query: 'news' },
        },
      ],
      finishReason: 'tool-calls',
      tokens: { prompt: 10, completion: 8 },
    }

    const messages = buildOutputMessages(result)

    expect(messages).toEqual([
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'I will search for that.' },
          {
            type: 'tool-call',
            toolCallId: 'call-123',
            toolName: 'web_search',
            args: { query: 'news' },
          },
        ],
        toolCalls: [
          {
            id: 'call-123',
            name: 'web_search',
            arguments: { query: 'news' },
          },
        ],
      },
    ])
  })

  it('builds message with text, reasoning, and tool calls', () => {
    const result: CapturedStreamResult = {
      text: 'Searching now.',
      reasoning: 'The user wants current news.',
      files: [],
      toolCalls: [
        {
          type: 'tool-call',
          toolCallId: 'call-789',
          toolName: 'web_search',
          args: { query: 'latest news' },
        },
      ],
      finishReason: 'tool-calls',
      tokens: { prompt: 15, completion: 20 },
    }

    const messages = buildOutputMessages(result)

    expect(messages).toEqual([
      {
        role: 'assistant',
        content: [
          { type: 'reasoning', text: 'The user wants current news.' },
          { type: 'text', text: 'Searching now.' },
          {
            type: 'tool-call',
            toolCallId: 'call-789',
            toolName: 'web_search',
            args: { query: 'latest news' },
          },
        ],
        toolCalls: [
          {
            id: 'call-789',
            name: 'web_search',
            arguments: { query: 'latest news' },
          },
        ],
      },
    ])
  })

  it('returns empty array when no content', () => {
    const result: CapturedStreamResult = {
      text: '',
      reasoning: '',
      files: [],
      toolCalls: [],
      finishReason: 'stop',
      tokens: { prompt: 5, completion: 0 },
    }

    const messages = buildOutputMessages(result)

    expect(messages).toEqual([
      {
        role: 'assistant',
        content: [],
        toolCalls: [],
      },
    ])
  })

  it('builds message with image files', () => {
    const imageData = new Uint8Array([1, 2, 3, 4])
    const result: CapturedStreamResult = {
      text: 'Here is an image.',
      reasoning: '',
      files: [
        {
          type: 'file',
          mediaType: 'image/png',
          data: imageData,
        },
        {
          type: 'file',
          mediaType: 'image/jpeg',
          data: imageData,
        },
      ],
      toolCalls: [],
      finishReason: 'stop',
      tokens: { prompt: 10, completion: 5 },
    }

    const messages = buildOutputMessages(result)

    expect(messages).toEqual([
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Here is an image.' },
          { type: 'image', image: imageData },
          { type: 'image', image: imageData },
        ],
        toolCalls: [],
      },
    ])
  })

  it('builds message with non-image files', () => {
    const pdfData = new ArrayBuffer(8)
    const result: CapturedStreamResult = {
      text: 'Here is a PDF.',
      reasoning: '',
      files: [
        {
          type: 'file',
          mediaType: 'application/pdf',
          data: pdfData,
        },
        {
          type: 'file',
          mediaType: 'text/plain',
          data: 'text content',
        },
      ],
      toolCalls: [],
      finishReason: 'stop',
      tokens: { prompt: 10, completion: 5 },
    }

    const messages = buildOutputMessages(result)

    expect(messages).toEqual([
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Here is a PDF.' },
          { type: 'file', file: pdfData, mimeType: 'application/pdf' },
          { type: 'file', file: 'text content', mimeType: 'text/plain' },
        ],
        toolCalls: [],
      },
    ])
  })

  it('builds message with mixed content including files', () => {
    const imageData = new Uint8Array([1, 2, 3])
    const pdfData = new ArrayBuffer(4)
    const result: CapturedStreamResult = {
      text: 'Mixed content.',
      reasoning: 'Some reasoning.',
      files: [
        {
          type: 'file',
          mediaType: 'image/png',
          data: imageData,
        },
        {
          type: 'file',
          mediaType: 'application/pdf',
          data: pdfData,
        },
      ],
      toolCalls: [
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'search',
          args: { query: 'test' },
        },
      ],
      finishReason: 'tool-calls',
      tokens: { prompt: 15, completion: 10 },
    }

    const messages = buildOutputMessages(result)

    expect(messages).toEqual([
      {
        role: 'assistant',
        content: [
          { type: 'reasoning', text: 'Some reasoning.' },
          { type: 'text', text: 'Mixed content.' },
          { type: 'image', image: imageData },
          { type: 'file', file: pdfData, mimeType: 'application/pdf' },
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'search',
            args: { query: 'test' },
          },
        ],
        toolCalls: [
          {
            id: 'call-1',
            name: 'search',
            arguments: { query: 'test' },
          },
        ],
      },
    ])
  })
})

describe('extractGenerateResultContent', () => {
  it('extracts text from content array', () => {
    const result = {
      content: [
        { type: 'text', text: 'Hello ' },
        { type: 'text', text: 'world!' },
      ],
      finishReason: 'stop',
      usage: { inputTokens: 10, outputTokens: 5 },
    }

    const captured = extractGenerateResultContent(result)

    expect(captured).toEqual({
      text: 'Hello world!',
      reasoning: '',
      files: [],
      toolCalls: [],
      finishReason: 'stop',
      tokens: {
        prompt: 10,
        completion: 5,
        cached: undefined,
        reasoning: undefined,
      },
    })
  })

  it('extracts reasoning from content array', () => {
    const result = {
      content: [
        { type: 'reasoning', text: 'Thinking...' },
        { type: 'text', text: 'Answer.' },
      ],
      finishReason: 'stop',
      usage: { inputTokens: 15, outputTokens: 10, reasoningTokens: 5 },
    }

    const captured = extractGenerateResultContent(result)

    expect(captured).toEqual(
      expect.objectContaining({
        text: 'Answer.',
        reasoning: 'Thinking...',
        files: [],
        tokens: expect.objectContaining({
          reasoning: 5,
        }),
      }),
    )
  })

  it('extracts tool calls from content array', () => {
    const result = {
      content: [
        { type: 'text', text: 'Calling tool.' },
        {
          type: 'tool-call',
          toolCallId: 'call-abc',
          toolName: 'calculator',
          args: { expression: '1+1' },
        },
      ],
      finishReason: 'tool-calls',
      usage: { inputTokens: 12, outputTokens: 8 },
    }

    const captured = extractGenerateResultContent(result)

    expect(captured).toEqual(
      expect.objectContaining({
        text: 'Calling tool.',
        files: [],
        toolCalls: [
          {
            type: 'tool-call',
            toolCallId: 'call-abc',
            toolName: 'calculator',
            args: { expression: '1+1' },
          },
        ],
        finishReason: 'tool-calls',
      }),
    )
  })

  it('handles non-array content', () => {
    const result = {
      content: 'just a string',
      finishReason: 'stop',
      usage: {},
    }

    const captured = extractGenerateResultContent(result)

    expect(captured).toEqual({
      text: '',
      reasoning: '',
      files: [],
      toolCalls: [],
      finishReason: 'stop',
      tokens: {
        prompt: undefined,
        completion: undefined,
        cached: undefined,
        reasoning: undefined,
      },
    })
  })

  it('handles cached input tokens', () => {
    const result = {
      content: [{ type: 'text', text: 'Cached response.' }],
      finishReason: 'stop',
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        cachedInputTokens: 8,
      },
    }

    const captured = extractGenerateResultContent(result)

    expect(captured.files).toEqual([])
    expect(captured.tokens).toEqual({
      prompt: 10,
      completion: 5,
      cached: 8,
      reasoning: undefined,
    })
  })

  it('extracts files from content array', () => {
    const imageData = new Uint8Array([1, 2, 3])
    const pdfData = new ArrayBuffer(4)
    const result = {
      content: [
        { type: 'text', text: 'With files.' },
        {
          type: 'file',
          mediaType: 'image/png',
          data: imageData,
        },
        {
          type: 'file',
          mediaType: 'application/pdf',
          data: pdfData,
        },
      ],
      finishReason: 'stop',
      usage: { inputTokens: 20, outputTokens: 10 },
    }

    const captured = extractGenerateResultContent(result)

    expect(captured.text).toBe('With files.')
    expect(captured.files).toEqual([
      {
        type: 'file',
        mediaType: 'image/png',
        data: imageData,
      },
      {
        type: 'file',
        mediaType: 'application/pdf',
        data: pdfData,
      },
    ])
    expect(captured.toolCalls).toEqual([])
  })

  it('ignores unknown content types', () => {
    const result = {
      content: [
        { type: 'image', image: 'base64...' },
        { type: 'text', text: 'With text.' },
        { type: 'unknown', data: 'whatever' },
      ],
      finishReason: 'stop',
      usage: { inputTokens: 20, outputTokens: 10 },
    }

    const captured = extractGenerateResultContent(result)

    expect(captured.text).toBe('With text.')
    expect(captured.files).toEqual([])
    expect(captured.toolCalls).toEqual([])
  })

  it('handles tool-call missing args', () => {
    const result = {
      content: [
        {
          type: 'tool-call',
          toolCallId: 'call-xyz',
          toolName: 'no_args_tool',
        },
      ],
      finishReason: 'tool-calls',
      usage: {},
    }

    const captured = extractGenerateResultContent(result)

    expect(captured.files).toEqual([])
    expect(captured.toolCalls).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'call-xyz',
        toolName: 'no_args_tool',
        args: undefined,
      },
    ])
  })
})
