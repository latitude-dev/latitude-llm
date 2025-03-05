import { describe, it, expect } from 'vitest'
import { performAgentMessagesOptimization } from './index'
import {
  AssistantMessage,
  ContentType,
  Message,
  MessageRole,
  ToolMessage,
} from '@latitude-data/compiler'
import {
  AGENT_RETURN_TOOL_NAME,
  FAKE_AGENT_START_TOOL_NAME,
  VercelConfig,
} from '@latitude-data/constants'

describe('performAgentMessagesOptimization', () => {
  it('adds fake agent start_workflow tool requests', () => {
    const messages: Message[] = [
      {
        role: MessageRole.system,
        content: [
          {
            type: ContentType.text,
            text: 'prompt 1',
          },
        ],
      },
      {
        role: MessageRole.system,
        content: [
          {
            type: ContentType.text,
            text: 'prompt 2',
          },
        ],
      },
      {
        role: MessageRole.user,
        content: [
          {
            type: ContentType.text,
            text: 'user initial message',
          },
        ],
      },
      {
        role: MessageRole.assistant,
        content: [
          {
            type: ContentType.text,
            text: 'prompt agent first step response',
          },
        ],
        toolCalls: [],
      },
      {
        role: MessageRole.assistant,
        content: [
          {
            type: ContentType.text,
            text: 'finish agent workflow',
          },
        ],
        toolCalls: [
          {
            id: 'agent_return_1',
            name: AGENT_RETURN_TOOL_NAME,
            arguments: {},
          },
        ],
      },
      {
        role: MessageRole.user,
        content: [
          {
            type: ContentType.text,
            text: 'user chat message',
          },
        ],
      },
      {
        role: MessageRole.assistant,
        content: [
          {
            type: ContentType.text,
            text: 'chat agent first step response',
          },
        ],
        toolCalls: [],
      },
    ]
    const config: VercelConfig = {
      provider: 'openai',
      model: 'latitude',
    }

    const fakeMessagesIdx = [3, 8] // Where the fake messages should go

    const optimizedConversation = performAgentMessagesOptimization({
      conversation: { messages, config },
    })

    const optimizedMessages = optimizedConversation.messages

    expect(optimizedMessages.length).toBe(
      messages.length + fakeMessagesIdx.length * 2,
    )
    for (const fakeMsgIdx of fakeMessagesIdx) {
      const fakeAssistantMessage = optimizedMessages[
        fakeMsgIdx
      ]! as AssistantMessage
      const fakeToolResponseMessage = optimizedMessages[
        fakeMsgIdx + 1
      ]! as ToolMessage

      expect(fakeAssistantMessage.role).toBe(MessageRole.assistant)
      expect(fakeAssistantMessage.toolCalls.length).toBe(1)
      expect(fakeAssistantMessage.toolCalls[0]!.name).toBe(
        FAKE_AGENT_START_TOOL_NAME,
      )

      expect(fakeToolResponseMessage.role).toBe(MessageRole.tool)
      expect(fakeToolResponseMessage.content.length).toBe(1)
      expect(fakeToolResponseMessage.content[0]!.type).toBe(
        ContentType.toolResult,
      )
      expect(fakeToolResponseMessage.content[0]!.toolCallId).toBe(
        fakeAssistantMessage.toolCalls[0]!.id,
      )
      expect(fakeToolResponseMessage.content[0]!.toolName).toBe(
        fakeAssistantMessage.toolCalls[0]!.name,
      )
      expect(fakeToolResponseMessage.content[0]!.result).toBeTypeOf('string')
      expect(fakeToolResponseMessage.content[0]!.isError).toBe(false)
    }
  })

  it('Restricts the first tool choice to none', () => {
    const messages: Message[] = []
    const config: VercelConfig = {
      provider: 'openai',
      model: 'latitude',
    }

    const optimizedConversation = performAgentMessagesOptimization({
      conversation: { messages, config },
      isFirstStep: true,
    })

    expect(optimizedConversation.config.toolChoice).toBe('none')
  })
})
