import { ContentType, MessageRole } from '@latitude-data/compiler'
import {
  LatitudeErrorCodes,
  RunErrorCodes,
} from '@latitude-data/constants/errors'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ChainStreamConsumer } from '.'
import {
  LegacyChainEventTypes,
  ChainStepResponse,
  Providers,
  StreamEventTypes,
  StreamType,
} from '../../../constants'
import * as factories from '../../../tests/factories'
import { ChainError } from '../ChainErrors'
import { ValidatedChainStep } from '../../../services/chains/ChainValidator'

describe('ChainStreamConsumer', () => {
  let controller: ReadableStreamDefaultController
  let consumer: ChainStreamConsumer
  let step: ValidatedChainStep

  beforeEach(async () => {
    const { workspace, userData: user } = await factories.createWorkspace()
    const provider = await factories.createProviderApiKey({
      workspace,
      user,
      name: 'Fake Provider',
      type: Providers.OpenAI,
      defaultModel: 'gpt4o-mini',
    })

    controller = {
      enqueue: vi.fn(),
      close: vi.fn(),
    } as unknown as ReadableStreamDefaultController

    consumer = new ChainStreamConsumer({
      controller,
      previousCount: 0,
      errorableUuid: 'errorable-uuid',
    })

    step = {
      chainCompleted: false,
      conversation: {
        messages: [
          {
            role: MessageRole.user,
            content: [{ type: ContentType.text, text: 'Fake user message 1' }],
          },
          {
            role: MessageRole.assistant,
            content: [
              { type: ContentType.text, text: 'Fake assistant message' },
            ],
            toolCalls: [],
          },
          {
            role: MessageRole.user,
            content: [{ type: ContentType.text, text: 'Fake user message 2' }],
          },
        ],
        config: { provider: provider.name, model: provider.defaultModel! },
      },
      provider: provider,
    }
  })

  it('enqueues a step event', () => {
    vi.spyOn(Date, 'now').mockReturnValue(123456789)

    const result = consumer.setup(step)

    expect(result).toEqual({
      messageCount: step.conversation.messages.length,
      stepStartTime: 123456789,
    })
    expect(controller.enqueue).toHaveBeenCalledWith({
      data: {
        type: LegacyChainEventTypes.Step,
        isLastStep: false,
        config: step.conversation.config,
        messages: step.conversation.messages,
        documentLogUuid: 'errorable-uuid',
      },
      event: StreamEventTypes.Latitude,
    })
    expect(controller.enqueue).toHaveBeenCalledOnce()
  })

  it('enqueues a step completed event', () => {
    const response: ChainStepResponse<StreamType> = {
      streamType: 'text',
      text: 'text response',
      reasoning: undefined,
      toolCalls: [],
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      documentLogUuid: 'errorable-uuid',
      finishReason: 'stop',
      chainCompleted: false,
    }

    consumer.stepCompleted(response)

    expect(controller.enqueue).toHaveBeenCalledWith({
      event: StreamEventTypes.Latitude,
      data: {
        type: LegacyChainEventTypes.StepComplete,
        documentLogUuid: 'errorable-uuid',
        response: response,
      },
    })
    expect(controller.enqueue).toHaveBeenCalledOnce()
  })

  it('enqueues a completed event with text response', () => {
    const response: ChainStepResponse<'text'> = {
      streamType: 'text',
      text: 'text response',
      reasoning: undefined,
      toolCalls: [],
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      documentLogUuid: 'errorable-uuid',
      finishReason: 'stop',
      chainCompleted: true,
    }

    consumer.chainCompleted({
      step,
      response,
      finishReason: 'stop',
      responseMessages: [
        {
          role: MessageRole.assistant,
          content: [
            {
              type: ContentType.text,
              text: 'text response',
            },
          ],
          toolCalls: [],
        },
      ],
    })

    expect(controller.enqueue).toHaveBeenCalledWith({
      event: StreamEventTypes.Latitude,
      data: {
        type: LegacyChainEventTypes.Complete,
        config: step.conversation.config,
        response: response,
        finishReason: 'stop',
        messages: [
          {
            role: MessageRole.assistant,
            content: [
              {
                type: ContentType.text,
                text: 'text response',
              },
            ],
            toolCalls: [],
          },
        ],
        documentLogUuid: 'errorable-uuid',
      },
    })
    expect(controller.enqueue).toHaveBeenCalledOnce()
    expect(controller.close).toHaveBeenCalledOnce()
  })

  it('enqueues a completed event with object response', () => {
    const response: ChainStepResponse<'object'> = {
      streamType: 'object',
      text: '',
      object: { object: 'response' },
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      documentLogUuid: 'errorable-uuid',
      finishReason: 'stop',
      chainCompleted: true,
    }

    consumer.chainCompleted({
      step,
      response,
      finishReason: 'stop',
      responseMessages: [
        {
          role: MessageRole.assistant,
          content: [
            {
              type: ContentType.text,
              text: '{\n  "object": "response"\n}',
            },
          ],
          toolCalls: [],
        },
      ],
    })

    expect(controller.enqueue).toHaveBeenCalledWith({
      event: StreamEventTypes.Latitude,
      data: {
        type: LegacyChainEventTypes.Complete,
        config: step.conversation.config,
        response: response,
        finishReason: 'stop',
        messages: [
          {
            role: MessageRole.assistant,
            content: [
              {
                type: ContentType.text,
                text: '{\n  "object": "response"\n}',
              },
            ],
            toolCalls: [],
          },
        ],
        documentLogUuid: 'errorable-uuid',
      },
    })
    expect(controller.enqueue).toHaveBeenCalledOnce()
    expect(controller.close).toHaveBeenCalledOnce()
  })

  it('enqueues a completed event with tool calls response', () => {
    const response: ChainStepResponse<'text'> = {
      streamType: 'text',
      text: '',
      reasoning: undefined,
      toolCalls: [
        {
          id: 'tool-call-id',
          name: 'tool-call-name',
          arguments: { arg1: 'value1', arg2: 'value2' },
        },
      ],
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      documentLogUuid: 'errorable-uuid',
      finishReason: 'stop',
      chainCompleted: true,
    }

    consumer.chainCompleted({
      step,
      response,
      finishReason: 'stop',
      responseMessages: [
        {
          role: MessageRole.assistant,
          content: [
            {
              type: ContentType.toolCall,
              toolCallId: 'tool-call-id',
              toolName: 'tool-call-name',
              args: { arg1: 'value1', arg2: 'value2' },
            },
          ],
          toolCalls: [
            {
              id: 'tool-call-id',
              name: 'tool-call-name',
              arguments: { arg1: 'value1', arg2: 'value2' },
            },
          ],
        },
      ],
    })

    expect(controller.enqueue).toHaveBeenCalledWith({
      event: StreamEventTypes.Latitude,
      data: {
        type: LegacyChainEventTypes.Complete,
        config: step.conversation.config,
        response: response,
        finishReason: 'stop',
        messages: [
          {
            role: MessageRole.assistant,
            content: [
              {
                type: ContentType.toolCall,
                toolCallId: 'tool-call-id',
                toolName: 'tool-call-name',
                args: { arg1: 'value1', arg2: 'value2' },
              },
            ],
            toolCalls: [
              {
                id: 'tool-call-id',
                name: 'tool-call-name',
                arguments: { arg1: 'value1', arg2: 'value2' },
              },
            ],
          },
        ],
        documentLogUuid: 'errorable-uuid',
      },
    })
    expect(controller.enqueue).toHaveBeenCalledOnce()
    expect(controller.close).toHaveBeenCalledOnce()
  })

  it('enqueues a completed event with tool calls and text response', () => {
    const response: ChainStepResponse<'text'> = {
      streamType: 'text',
      text: 'text response',
      reasoning: undefined,
      toolCalls: [
        {
          id: 'tool-call-id',
          name: 'tool-call-name',
          arguments: { arg1: 'value1', arg2: 'value2' },
        },
      ],
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      documentLogUuid: 'errorable-uuid',
      finishReason: 'stop',
      chainCompleted: true,
    }

    consumer.chainCompleted({
      step,
      response,
      finishReason: 'stop',
      responseMessages: [
        {
          role: MessageRole.assistant,
          content: [
            {
              type: ContentType.text,
              text: 'text response',
            },
            {
              type: ContentType.toolCall,
              toolCallId: 'tool-call-id',
              toolName: 'tool-call-name',
              args: { arg1: 'value1', arg2: 'value2' },
            },
          ],
          toolCalls: [
            {
              id: 'tool-call-id',
              name: 'tool-call-name',
              arguments: { arg1: 'value1', arg2: 'value2' },
            },
          ],
        },
      ],
    })

    expect(controller.enqueue).toHaveBeenCalledWith({
      event: StreamEventTypes.Latitude,
      data: {
        type: LegacyChainEventTypes.Complete,
        config: step.conversation.config,
        finishReason: 'stop',
        response: response,
        messages: [
          {
            role: MessageRole.assistant,
            content: [
              {
                type: ContentType.text,
                text: 'text response',
              },
              {
                type: ContentType.toolCall,
                toolCallId: 'tool-call-id',
                toolName: 'tool-call-name',
                args: { arg1: 'value1', arg2: 'value2' },
              },
            ],
            toolCalls: [
              {
                id: 'tool-call-id',
                name: 'tool-call-name',
                arguments: { arg1: 'value1', arg2: 'value2' },
              },
            ],
          },
        ],
        documentLogUuid: 'errorable-uuid',
      },
    })
    expect(controller.enqueue).toHaveBeenCalledOnce()
    expect(controller.close).toHaveBeenCalledOnce()
  })

  it('enqueues an error event with ChainError', () => {
    const error = new ChainError({
      code: RunErrorCodes.AIRunError,
      message: 'AI run finished with error',
    })

    consumer.chainError(error)

    expect(controller.enqueue).toHaveBeenCalledWith({
      event: StreamEventTypes.Latitude,
      data: {
        type: LegacyChainEventTypes.Error,
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
      },
    })
    expect(controller.enqueue).toHaveBeenCalledOnce()
    expect(controller.close).toHaveBeenCalledOnce()
  })

  it('enqueues an error event with unknown error', () => {
    const error = new Error('Unknown error')

    consumer.chainError(error)

    expect(controller.enqueue).toHaveBeenCalledWith({
      event: StreamEventTypes.Latitude,
      data: {
        type: LegacyChainEventTypes.Error,
        error: {
          name: LatitudeErrorCodes.UnprocessableEntityError,
          message: error.message,
          stack: error.stack,
        },
      },
    })
    expect(controller.enqueue).toHaveBeenCalledOnce()
    expect(controller.close).toHaveBeenCalledOnce()
  })
})
