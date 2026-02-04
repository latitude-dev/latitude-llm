import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'
import {
  AssistantMessage,
  MessageContent,
  ToolResultContent,
  ToolMessage,
} from '@latitude-data/constants/messages'
import {
  AssistantModelMessage,
  FilePart,
  TextPart,
  ToolCallPart,
  ToolModelMessage,
  ToolResultPart,
} from 'ai'
import { describe, expect, it } from 'vitest'
import { convertResponseMessages } from './convertResponseMessages'

// Local stub since SDK doesn’t export ReasoningPart
type ReasoningPart = {
  type: 'reasoning'
  text: string
}

describe('convertResponseMessages (integration)', () => {
  it('converts plain string assistant content', async () => {
    const msg: AssistantModelMessage = {
      role: 'assistant',
      content: 'hello',
    }

    const out = convertResponseMessages({ messages: [msg] })

    const assistant = out[0] as AssistantMessage
    expect(assistant.role).toBe('assistant')
    expect(assistant.content).toEqual([{ type: 'text', text: 'hello' }])
    expect(assistant.toolCalls).toBeNull()
  })

  it('converts text parts', async () => {
    const parts: TextPart[] = [{ type: 'text', text: 'foo' }]
    const msg: AssistantModelMessage = { role: 'assistant', content: parts }

    const out = convertResponseMessages({ messages: [msg] })
    expect(out[0].content).toEqual([{ type: 'text', text: 'foo' }])
  })

  it('converts file parts (image vs non-image)', async () => {
    const imagePart: FilePart = {
      type: 'file',
      data: 'binimg',
      mediaType: 'image/png',
    }
    const pdfPart: FilePart = {
      type: 'file',
      data: 'bindoc',
      mediaType: 'application/pdf',
    }
    const msg: AssistantModelMessage = {
      role: 'assistant',
      content: [imagePart, pdfPart],
    }

    const out = convertResponseMessages({ messages: [msg] })
    expect(out[0].content).toContainEqual({ type: 'image', image: 'binimg' })
    expect(out[0].content).toContainEqual({
      type: 'file',
      file: 'bindoc',
      mimeType: 'application/pdf',
    })
  })

  it('converts reasoning parts', async () => {
    const reasoning: ReasoningPart = { type: 'reasoning', text: 'thinking...' }
    const msg: AssistantModelMessage = {
      role: 'assistant',
      content: [reasoning],
    }

    const out = convertResponseMessages({ messages: [msg] })
    expect(out[0].content).toContainEqual({
      type: 'reasoning',
      text: 'thinking...',
    })
  })

  it('converts tool-call parts and populates toolCalls', async () => {
    const tc: ToolCallPart = {
      type: 'tool-call',
      toolCallId: 'id1',
      toolName: 'T',
      input: { a: 1 },
    }
    const msg: AssistantModelMessage = { role: 'assistant', content: [tc] }

    const out = convertResponseMessages({ messages: [msg] })
    const assistant = out[0] as AssistantMessage
    expect(assistant.content).toContainEqual(
      expect.objectContaining({
        type: 'tool-call',
        toolCallId: 'id1',
        toolName: 'T',
        args: { a: 1 },
      }),
    )
    expect(assistant.toolCalls).toEqual([
      { id: 'id1', name: 'T', arguments: { a: 1 } },
    ])
  })

  it('converts tool-result with text output', async () => {
    const tr: ToolResultPart = {
      type: 'tool-result',
      toolCallId: 'x',
      toolName: 'T',
      output: { type: 'text', value: 'ok' },
    }
    const msg: AssistantModelMessage = { role: 'assistant', content: [tr] }

    const out = convertResponseMessages({ messages: [msg] })
    expect(out[0].content).toContainEqual({
      type: 'tool-result',
      toolCallId: 'x',
      toolName: 'T',
      result: 'ok',
      isError: false,
    })
  })

  it('converts tool-result with json and error types', async () => {
    const tr1: ToolResultPart = {
      type: 'tool-result',
      toolCallId: 'a',
      toolName: 'A',
      output: { type: 'json', value: { k: 1 } },
    }
    const tr2: ToolResultPart = {
      type: 'tool-result',
      toolCallId: 'b',
      toolName: 'B',
      output: { type: 'error-text', value: 'bad' },
    }
    const msg: AssistantModelMessage = {
      role: 'assistant',
      content: [tr1, tr2],
    }

    const out = convertResponseMessages({ messages: [msg] })
    expect(out[0].content).toContainEqual({
      type: 'tool-result',
      toolCallId: 'a',
      toolName: 'A',
      result: { k: 1 },
      isError: false,
    })
    expect(out[1].content).toContainEqual({
      type: 'tool-result',
      toolCallId: 'b',
      toolName: 'B',
      result: 'bad',
      isError: true,
    })
  })

  it('converts tool-result with content output', async () => {
    const tr: ToolResultPart = {
      type: 'tool-result',
      toolCallId: 'z',
      toolName: 'Z',
      output: {
        type: 'content',
        value: [
          { type: 'text', text: 'hey' },
          { type: 'media', data: 'filebytes', mediaType: 'image/jpeg' },
        ],
      },
    }
    const msg: AssistantModelMessage = { role: 'assistant', content: [tr] }
    const out = convertResponseMessages({ messages: [msg] })
    const assistant = out[0] as AssistantMessage
    if (!Array.isArray(assistant.content)) {
      throw new Error('Expected array content for assistant message')
    }

    const isToolResultContent = (c: MessageContent) => c.type === 'tool-result'

    const toolResult = assistant.content.find(
      (c): c is ToolResultContent =>
        isToolResultContent(c as MessageContent) &&
        (c as ToolResultContent).toolCallId === 'z',
    ) as ToolResultContent

    expect(toolResult).toBeDefined()
    expect(toolResult?.result).toContainEqual({ type: 'text', text: 'hey' })
    expect(toolResult?.result).toContainEqual({
      type: 'media',
      data: 'filebytes',
      mediaType: 'image/jpeg',
    })
  })

  it('converts tool messages', async () => {
    const tr: ToolResultPart = {
      type: 'tool-result',
      toolCallId: 'tid',
      toolName: 'tooly',
      output: { type: 'json', value: { ok: true } },
    }
    const msg: ToolModelMessage = { role: 'tool', content: [tr] }

    const out = convertResponseMessages({ messages: [msg] })
    const toolMsg = out[0] as ToolMessage
    expect(toolMsg.role).toBe('tool')
    expect(toolMsg.content).toContainEqual({
      type: 'tool-result',
      toolCallId: 'tid',
      toolName: 'tooly',
      result: { ok: true },
      isError: false,
    })
  })

  it('throws ChainError with correct code on unsupported role', () => {
    const badMsg = { role: 'user', content: 'hi' }

    expect(() =>
      // @ts-expect-error - testing bad input
      convertResponseMessages({ messages: [badMsg] }),
    ).toThrowError(
      expect.objectContaining({
        code: RunErrorCodes.InvalidResponseFormatError,
        message: expect.stringMatching(/Unsupported provider message role/),
      }),
    )

    expect(() =>
      // @ts-expect-error - testing bad input
      convertResponseMessages({ messages: [badMsg] }),
    ).toThrowError(ChainError)
  })
})
