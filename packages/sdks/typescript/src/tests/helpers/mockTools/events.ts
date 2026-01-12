import {
  ChainEvent,
  ChainEventTypes,
  StreamEventTypes,
} from '@latitude-data/constants'
import { MessageRole } from '@latitude-data/constants/legacyCompiler'

export const TOOLS_DOCUMENT_UUID = '02e6ac23-a43b-4c3a-aedc-41b7d5e26a1b'
type ToolsEventsObject<T> = {
  runEvents: T
  chatEventsFirst: T
  chatEventsLast: T
}
export const TOOL_EVENTS_OBJECT: ToolsEventsObject<ChainEvent[]> = {
  runEvents: [
    {
      event: StreamEventTypes.Latitude,
      data: {
        type: ChainEventTypes.ChainStarted,
        timestamp: 965044800000,
        uuid: TOOLS_DOCUMENT_UUID,
        messages: [],
        source: undefined,
      },
    },
    {
      event: StreamEventTypes.Latitude,
      data: {
        type: ChainEventTypes.StepStarted,
        timestamp: 965044800000,
        uuid: TOOLS_DOCUMENT_UUID,
        messages: [
          {
            role: MessageRole.system,
            content: [
              {
                type: 'text',
                text: "You are a concerned mom. If the temperature is low, make recommendations to put on clothes, and if it's hot and sunny, be careful with so much exposure!\n\nBefore saying anything to the user, you must now their location and the current weather!\n\nIMPORTANT: Use exactly the names pased in the parameters for the locations. Do not add extra information.",
              },
              {
                type: 'text',
                text: 'First, locate the one or many recommendation requests.',
              },
            ],
          },
          {
            role: MessageRole.user,
            content: [
              {
                type: 'text',
                text: "Hi mom! I'm currently in Barcelona and Miami and Andrés is in Boston! Can you give us tips on what clothes we should put on?",
              },
            ],
          },
        ],
      },
    },
    {
      event: StreamEventTypes.Latitude,
      data: {
        type: ChainEventTypes.ProviderStarted,
        timestamp: 965044800000,
        uuid: TOOLS_DOCUMENT_UUID,
        messages: [
          {
            role: MessageRole.system,
            content: [
              {
                type: 'text',
                text: "You are a concerned mom. If the temperature is low, make recommendations to put on clothes, and if it's hot and sunny, be careful with so much exposure!\n\nBefore saying anything to the user, you must now their location and the current weather!\n\nIMPORTANT: Use exactly the names pased in the parameters for the locations. Do not add extra information.",
              },
              {
                type: 'text',
                text: 'First, locate the one or many recommendation requests.',
              },
            ],
          },
          {
            role: MessageRole.user,
            content: [
              {
                type: 'text',
                text: "Hi mom! I'm currently in Barcelona and Miami and Andrés is in Boston! Can you give us tips on what clothes we should put on?",
              },
            ],
          },
        ],
        config: {},
        source: undefined,
      },
    },
    {
      event: StreamEventTypes.Latitude,
      data: {
        type: ChainEventTypes.ProviderCompleted,
        timestamp: 965044800000,
        uuid: TOOLS_DOCUMENT_UUID,
        messages: [
          {
            role: MessageRole.system,
            content: [
              {
                type: 'text',
                text: "You are a concerned mom. If the temperature is low, make recommendations to put on clothes, and if it's hot and sunny, be careful with so much exposure!\n\nBefore saying anything to the user, you must now their location and the current weather!\n\nIMPORTANT: Use exactly the names pased in the parameters for the locations. Do not add extra information.",
              },
              {
                type: 'text',
                text: 'First, locate the one or many recommendation requests.',
              },
            ],
          },
          {
            role: MessageRole.user,
            content: [
              {
                type: 'text',
                text: "Hi mom! I'm currently in Barcelona and Miami and Andrés is in Boston! Can you give us tips on what clothes we should put on?",
              },
            ],
          },
          {
            role: MessageRole.assistant,
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call_NCVUjMa6MeqDuj2bicbYOV1L',
                toolName: 'get_coordinates',
                args: {
                  location: 'Barcelona',
                },
              },
              {
                type: 'tool-call',
                toolCallId: 'call_KTPRHMRYPCF6NisrKhLxevEf',
                toolName: 'get_coordinates',
                args: {
                  location: 'Miami',
                },
              },
              {
                type: 'tool-call',
                toolCallId: 'call_LRmAwTyy8NXChQo6reGll0tG',
                toolName: 'get_coordinates',
                args: {
                  location: 'Boston',
                },
              },
            ],
            toolCalls: [
              {
                id: 'call_NCVUjMa6MeqDuj2bicbYOV1L',
                name: 'get_coordinates',
                arguments: {
                  location: 'Barcelona',
                },
              },
              {
                id: 'call_KTPRHMRYPCF6NisrKhLxevEf',
                name: 'get_coordinates',
                arguments: {
                  location: 'Miami',
                },
              },
              {
                id: 'call_LRmAwTyy8NXChQo6reGll0tG',
                name: 'get_coordinates',
                arguments: {
                  location: 'Boston',
                },
              },
            ],
          },
        ],
        response: {
          streamType: 'text',
          documentLogUuid: TOOLS_DOCUMENT_UUID,
          text: '',
          usage: {
            inputTokens: 251,
            outputTokens: 59,
            promptTokens: 251,
            completionTokens: 59,
            totalTokens: 310,
            reasoningTokens: 0,
            cachedInputTokens: 0,
          },
          toolCalls: [
            {
              id: 'call_NCVUjMa6MeqDuj2bicbYOV1L',
              name: 'get_coordinates',
              arguments: {
                location: 'Barcelona',
              },
            },
            {
              id: 'call_KTPRHMRYPCF6NisrKhLxevEf',
              name: 'get_coordinates',
              arguments: {
                location: 'Miami',
              },
            },
            {
              id: 'call_LRmAwTyy8NXChQo6reGll0tG',
              name: 'get_coordinates',
              arguments: {
                location: 'Boston',
              },
            },
          ],
        },
        providerLogUuid: '123',
        tokenUsage: {
          inputTokens: 251,
          outputTokens: 59,
          promptTokens: 251,
          completionTokens: 59,
          totalTokens: 310,
          reasoningTokens: 0,
          cachedInputTokens: 0,
        },
        finishReason: 'tool-calls',
      },
    },
    {
      event: StreamEventTypes.Latitude,
      data: {
        type: ChainEventTypes.StepCompleted,
        timestamp: 965044800000,
        uuid: TOOLS_DOCUMENT_UUID,
        messages: [
          {
            role: MessageRole.system,
            content: [
              {
                type: 'text',
                text: "You are a concerned mom. If the temperature is low, make recommendations to put on clothes, and if it's hot and sunny, be careful with so much exposure!\n\nBefore saying anything to the user, you must now their location and the current weather!\n\nIMPORTANT: Use exactly the names pased in the parameters for the locations. Do not add extra information.",
              },
              {
                type: 'text',
                text: 'First, locate the one or many recommendation requests.',
              },
            ],
          },
          {
            role: MessageRole.user,
            content: [
              {
                type: 'text',
                text: "Hi mom! I'm currently in Barcelona and Miami and Andrés is in Boston! Can you give us tips on what clothes we should put on?",
              },
            ],
          },
          {
            role: MessageRole.assistant,
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call_NCVUjMa6MeqDuj2bicbYOV1L',
                toolName: 'get_coordinates',
                args: {
                  location: 'Barcelona',
                },
              },
              {
                type: 'tool-call',
                toolCallId: 'call_KTPRHMRYPCF6NisrKhLxevEf',
                toolName: 'get_coordinates',
                args: {
                  location: 'Miami',
                },
              },
              {
                type: 'tool-call',
                toolCallId: 'call_LRmAwTyy8NXChQo6reGll0tG',
                toolName: 'get_coordinates',
                args: {
                  location: 'Boston',
                },
              },
            ],
            toolCalls: [
              {
                id: 'call_NCVUjMa6MeqDuj2bicbYOV1L',
                name: 'get_coordinates',
                arguments: {
                  location: 'Barcelona',
                },
              },
              {
                id: 'call_KTPRHMRYPCF6NisrKhLxevEf',
                name: 'get_coordinates',
                arguments: {
                  location: 'Miami',
                },
              },
              {
                id: 'call_LRmAwTyy8NXChQo6reGll0tG',
                name: 'get_coordinates',
                arguments: {
                  location: 'Boston',
                },
              },
            ],
          },
        ],
      },
    },
    {
      event: StreamEventTypes.Latitude,
      data: {
        type: ChainEventTypes.StepCompleted,
        timestamp: 965044800000,
        uuid: TOOLS_DOCUMENT_UUID,
        messages: [
          {
            role: MessageRole.system,
            content: [
              {
                type: 'text',
                text: "You are a concerned mom. If the temperature is low, make recommendations to put on clothes, and if it's hot and sunny, be careful with so much exposure!\n\nBefore saying anything to the user, you must now their location and the current weather!\n\nIMPORTANT: Use exactly the names pased in the parameters for the locations. Do not add extra information.",
              },
              {
                type: 'text',
                text: 'First, locate the one or many recommendation requests.',
              },
            ],
          },
          {
            role: MessageRole.user,
            content: [
              {
                type: 'text',
                text: "Hi mom! I'm currently in Barcelona and Miami and Andrés is in Boston! Can you give us tips on what clothes we should put on?",
              },
            ],
          },
          {
            role: MessageRole.assistant,
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call_NCVUjMa6MeqDuj2bicbYOV1L',
                toolName: 'get_coordinates',
                args: {
                  location: 'Barcelona',
                },
              },
              {
                type: 'tool-call',
                toolCallId: 'call_KTPRHMRYPCF6NisrKhLxevEf',
                toolName: 'get_coordinates',
                args: {
                  location: 'Miami',
                },
              },
              {
                type: 'tool-call',
                toolCallId: 'call_LRmAwTyy8NXChQo6reGll0tG',
                toolName: 'get_coordinates',
                args: {
                  location: 'Boston',
                },
              },
            ],
            toolCalls: [
              {
                id: 'call_NCVUjMa6MeqDuj2bicbYOV1L',
                name: 'get_coordinates',
                arguments: {
                  location: 'Barcelona',
                },
              },
              {
                id: 'call_KTPRHMRYPCF6NisrKhLxevEf',
                name: 'get_coordinates',
                arguments: {
                  location: 'Miami',
                },
              },
              {
                id: 'call_LRmAwTyy8NXChQo6reGll0tG',
                name: 'get_coordinates',
                arguments: {
                  location: 'Boston',
                },
              },
            ],
          },
        ],
      },
    },
  ],
  chatEventsFirst: [
    {
      event: StreamEventTypes.Latitude,
      data: {
        type: ChainEventTypes.ChainStarted,
        timestamp: 965044800000,
        uuid: TOOLS_DOCUMENT_UUID,
        messages: [
          {
            role: MessageRole.system,
            content: [
              {
                type: 'text',
                text: "You are a concerned mom. If the temperature is low, make recommendations to put on clothes, and if it's hot and sunny, be careful with so much exposure!\n\nBefore saying anything to the user, you must now their location and the current weather!\n\nIMPORTANT: Use exactly the names pased in the parameters for the locations. Do not add extra information.",
              },
              {
                type: 'text',
                text: 'First, locate the one or many recommendation requests.',
              },
            ],
          },
          {
            role: MessageRole.user,
            content: [
              {
                type: 'text',
                text: "Hi mom! I'm currently in Barcelona and Miami and Andrés is in Boston! Can you give us tips on what clothes we should put on?",
              },
            ],
          },
          {
            role: MessageRole.assistant,
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call_NCVUjMa6MeqDuj2bicbYOV1L',
                toolName: 'get_coordinates',
                args: {
                  location: 'Barcelona',
                },
              },
              {
                type: 'tool-call',
                toolCallId: 'call_KTPRHMRYPCF6NisrKhLxevEf',
                toolName: 'get_coordinates',
                args: {
                  location: 'Miami',
                },
              },
              {
                type: 'tool-call',
                toolCallId: 'call_LRmAwTyy8NXChQo6reGll0tG',
                toolName: 'get_coordinates',
                args: {
                  location: 'Boston',
                },
              },
            ],
            toolCalls: [
              {
                id: 'call_NCVUjMa6MeqDuj2bicbYOV1L',
                name: 'get_coordinates',
                arguments: {
                  location: 'Barcelona',
                },
              },
              {
                id: 'call_KTPRHMRYPCF6NisrKhLxevEf',
                name: 'get_coordinates',
                arguments: {
                  location: 'Miami',
                },
              },
              {
                id: 'call_LRmAwTyy8NXChQo6reGll0tG',
                name: 'get_coordinates',
                arguments: {
                  location: 'Boston',
                },
              },
            ],
          },
        ],
      },
    },
    {
      event: StreamEventTypes.Latitude,
      data: {
        type: ChainEventTypes.StepStarted,
        timestamp: 965044800000,
        uuid: TOOLS_DOCUMENT_UUID,
        messages: [
          {
            role: MessageRole.system,
            content: [
              {
                type: 'text',
                text: "You are a concerned mom. If the temperature is low, make recommendations to put on clothes, and if it's hot and sunny, be careful with so much exposure!\n\nBefore saying anything to the user, you must now their location and the current weather!\n\nIMPORTANT: Use exactly the names pased in the parameters for the locations. Do not add extra information.",
              },
              {
                type: 'text',
                text: 'First, locate the one or many recommendation requests.',
              },
            ],
          },
          {
            role: MessageRole.user,
            content: [
              {
                type: 'text',
                text: "Hi mom! I'm currently in Barcelona and Miami and Andrés is in Boston! Can you give us tips on what clothes we should put on?",
              },
            ],
          },
          {
            role: MessageRole.assistant,
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call_NCVUjMa6MeqDuj2bicbYOV1L',
                toolName: 'get_coordinates',
                args: {
                  location: 'Barcelona',
                },
              },
              {
                type: 'tool-call',
                toolCallId: 'call_KTPRHMRYPCF6NisrKhLxevEf',
                toolName: 'get_coordinates',
                args: {
                  location: 'Miami',
                },
              },
              {
                type: 'tool-call',
                toolCallId: 'call_LRmAwTyy8NXChQo6reGll0tG',
                toolName: 'get_coordinates',
                args: {
                  location: 'Boston',
                },
              },
            ],
            toolCalls: [
              {
                id: 'call_NCVUjMa6MeqDuj2bicbYOV1L',
                name: 'get_coordinates',
                arguments: {
                  location: 'Barcelona',
                },
              },
              {
                id: 'call_KTPRHMRYPCF6NisrKhLxevEf',
                name: 'get_coordinates',
                arguments: {
                  location: 'Miami',
                },
              },
              {
                id: 'call_LRmAwTyy8NXChQo6reGll0tG',
                name: 'get_coordinates',
                arguments: {
                  location: 'Boston',
                },
              },
            ],
          },
          {
            role: MessageRole.tool,
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_NCVUjMa6MeqDuj2bicbYOV1L',
                toolName: 'get_coordinates',
                result: {
                  latitude: '41.3851',
                  longitude: '2.1734',
                },
                isError: false,
              },
            ],
          },
          {
            role: MessageRole.tool,
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_KTPRHMRYPCF6NisrKhLxevEf',
                toolName: 'get_coordinates',
                result: {
                  latitude: '25.7617',
                  longitude: '-80.1918',
                },
                isError: false,
              },
            ],
          },
          {
            role: MessageRole.tool,
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_LRmAwTyy8NXChQo6reGll0tG',
                toolName: 'get_coordinates',
                result: {
                  latitude: '42.3601',
                  longitude: '-71.0589',
                },
                isError: false,
              },
            ],
          },
          {
            role: MessageRole.system,
            content: [
              {
                type: 'text',
                text: 'Now get the weather from the one or many recommendation requests.',
              },
            ],
          },
        ],
      },
    },
    {
      event: StreamEventTypes.Latitude,
      data: {
        type: ChainEventTypes.ProviderStarted,
        timestamp: 965044800000,
        uuid: TOOLS_DOCUMENT_UUID,
        messages: [
          {
            role: MessageRole.system,
            content: [
              {
                type: 'text',
                text: "You are a concerned mom. If the temperature is low, make recommendations to put on clothes, and if it's hot and sunny, be careful with so much exposure!\n\nBefore saying anything to the user, you must now their location and the current weather!\n\nIMPORTANT: Use exactly the names pased in the parameters for the locations. Do not add extra information.",
              },
              {
                type: 'text',
                text: 'First, locate the one or many recommendation requests.',
              },
            ],
          },
          {
            role: MessageRole.user,
            content: [
              {
                type: 'text',
                text: "Hi mom! I'm currently in Barcelona and Miami and Andrés is in Boston! Can you give us tips on what clothes we should put on?",
              },
            ],
          },
          {
            role: MessageRole.assistant,
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call_NCVUjMa6MeqDuj2bicbYOV1L',
                toolName: 'get_coordinates',
                args: {
                  location: 'Barcelona',
                },
              },
              {
                type: 'tool-call',
                toolCallId: 'call_KTPRHMRYPCF6NisrKhLxevEf',
                toolName: 'get_coordinates',
                args: {
                  location: 'Miami',
                },
              },
              {
                type: 'tool-call',
                toolCallId: 'call_LRmAwTyy8NXChQo6reGll0tG',
                toolName: 'get_coordinates',
                args: {
                  location: 'Boston',
                },
              },
            ],
            toolCalls: [
              {
                id: 'call_NCVUjMa6MeqDuj2bicbYOV1L',
                name: 'get_coordinates',
                arguments: {
                  location: 'Barcelona',
                },
              },
              {
                id: 'call_KTPRHMRYPCF6NisrKhLxevEf',
                name: 'get_coordinates',
                arguments: {
                  location: 'Miami',
                },
              },
              {
                id: 'call_LRmAwTyy8NXChQo6reGll0tG',
                name: 'get_coordinates',
                arguments: {
                  location: 'Boston',
                },
              },
            ],
          },
          {
            role: MessageRole.tool,
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_NCVUjMa6MeqDuj2bicbYOV1L',
                toolName: 'get_coordinates',
                result: {
                  latitude: '41.3851',
                  longitude: '2.1734',
                },
                isError: false,
              },
            ],
          },
          {
            role: MessageRole.tool,
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_KTPRHMRYPCF6NisrKhLxevEf',
                toolName: 'get_coordinates',
                result: {
                  latitude: '25.7617',
                  longitude: '-80.1918',
                },
                isError: false,
              },
            ],
          },
          {
            role: MessageRole.tool,
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_LRmAwTyy8NXChQo6reGll0tG',
                toolName: 'get_coordinates',
                result: {
                  latitude: '42.3601',
                  longitude: '-71.0589',
                },
                isError: false,
              },
            ],
          },
          {
            role: MessageRole.system,
            content: [
              {
                type: 'text',
                text: 'Now get the weather from the one or many recommendation requests.',
              },
            ],
          },
        ],
        config: {},
      },
    },
    {
      event: StreamEventTypes.Latitude,
      data: {
        type: ChainEventTypes.ProviderCompleted,
        timestamp: 965044800000,
        uuid: TOOLS_DOCUMENT_UUID,
        messages: [
          {
            role: MessageRole.system,
            content: [
              {
                type: 'text',
                text: "You are a concerned mom. If the temperature is low, make recommendations to put on clothes, and if it's hot and sunny, be careful with so much exposure!\n\nBefore saying anything to the user, you must now their location and the current weather!\n\nIMPORTANT: Use exactly the names pased in the parameters for the locations. Do not add extra information.",
              },
              {
                type: 'text',
                text: 'First, locate the one or many recommendation requests.',
              },
            ],
          },
          {
            role: MessageRole.user,
            content: [
              {
                type: 'text',
                text: "Hi mom! I'm currently in Barcelona and Miami and Andrés is in Boston! Can you give us tips on what clothes we should put on?",
              },
            ],
          },
          {
            role: MessageRole.assistant,
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call_NCVUjMa6MeqDuj2bicbYOV1L',
                toolName: 'get_coordinates',
                args: {
                  location: 'Barcelona',
                },
              },
              {
                type: 'tool-call',
                toolCallId: 'call_KTPRHMRYPCF6NisrKhLxevEf',
                toolName: 'get_coordinates',
                args: {
                  location: 'Miami',
                },
              },
              {
                type: 'tool-call',
                toolCallId: 'call_LRmAwTyy8NXChQo6reGll0tG',
                toolName: 'get_coordinates',
                args: {
                  location: 'Boston',
                },
              },
            ],
            toolCalls: [
              {
                id: 'call_NCVUjMa6MeqDuj2bicbYOV1L',
                name: 'get_coordinates',
                arguments: {
                  location: 'Barcelona',
                },
              },
              {
                id: 'call_KTPRHMRYPCF6NisrKhLxevEf',
                name: 'get_coordinates',
                arguments: {
                  location: 'Miami',
                },
              },
              {
                id: 'call_LRmAwTyy8NXChQo6reGll0tG',
                name: 'get_coordinates',
                arguments: {
                  location: 'Boston',
                },
              },
            ],
          },
          {
            role: MessageRole.tool,
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_NCVUjMa6MeqDuj2bicbYOV1L',
                toolName: 'get_coordinates',
                result: {
                  latitude: '41.3851',
                  longitude: '2.1734',
                },
                isError: false,
              },
            ],
          },
          {
            role: MessageRole.tool,
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_KTPRHMRYPCF6NisrKhLxevEf',
                toolName: 'get_coordinates',
                result: {
                  latitude: '25.7617',
                  longitude: '-80.1918',
                },
                isError: false,
              },
            ],
          },
          {
            role: MessageRole.tool,
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_LRmAwTyy8NXChQo6reGll0tG',
                toolName: 'get_coordinates',
                result: {
                  latitude: '42.3601',
                  longitude: '-71.0589',
                },
                isError: false,
              },
            ],
          },
          {
            role: MessageRole.system,
            content: [
              {
                type: 'text',
                text: 'Now get the weather from the one or many recommendation requests.',
              },
            ],
          },
          {
            role: MessageRole.assistant,
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call_CtgG80sOeYxUGR5J0Y0ZOiKF',
                toolName: 'get_weather',
                args: {
                  latitude: '41.3851',
                  longitude: '2.1734',
                },
              },
              {
                type: 'tool-call',
                toolCallId: 'call_AkTTcOQFhomjshMlgR4IDZ4m',
                toolName: 'get_weather',
                args: {
                  latitude: '25.7617',
                  longitude: '-80.1918',
                },
              },
              {
                type: 'tool-call',
                toolCallId: 'call_GzO72dVu3qf1cOBWVgsNQvUw',
                toolName: 'get_weather',
                args: {
                  latitude: '42.3601',
                  longitude: '-71.0589',
                },
              },
            ],
            toolCalls: [
              {
                id: 'call_CtgG80sOeYxUGR5J0Y0ZOiKF',
                name: 'get_weather',
                arguments: {
                  latitude: '41.3851',
                  longitude: '2.1734',
                },
              },
              {
                id: 'call_AkTTcOQFhomjshMlgR4IDZ4m',
                name: 'get_weather',
                arguments: {
                  latitude: '25.7617',
                  longitude: '-80.1918',
                },
              },
              {
                id: 'call_GzO72dVu3qf1cOBWVgsNQvUw',
                name: 'get_weather',
                arguments: {
                  latitude: '42.3601',
                  longitude: '-71.0589',
                },
              },
            ],
          },
        ],
        response: {
          streamType: 'text',
          documentLogUuid: TOOLS_DOCUMENT_UUID,
          text: '',
          usage: {
            inputTokens: 391,
            outputTokens: 91,
            promptTokens: 391,
            completionTokens: 91,
            totalTokens: 482,
            reasoningTokens: 0,
            cachedInputTokens: 0,
          },
          toolCalls: [
            {
              id: 'call_CtgG80sOeYxUGR5J0Y0ZOiKF',
              name: 'get_weather',
              arguments: {
                latitude: '41.3851',
                longitude: '2.1734',
              },
            },
            {
              id: 'call_AkTTcOQFhomjshMlgR4IDZ4m',
              name: 'get_weather',
              arguments: {
                latitude: '25.7617',
                longitude: '-80.1918',
              },
            },
            {
              id: 'call_GzO72dVu3qf1cOBWVgsNQvUw',
              name: 'get_weather',
              arguments: {
                latitude: '42.3601',
                longitude: '-71.0589',
              },
            },
          ],
        },
        providerLogUuid: '456',
        tokenUsage: {
          inputTokens: 391,
          outputTokens: 91,
          promptTokens: 391,
          completionTokens: 91,
          totalTokens: 482,
          reasoningTokens: 0,
          cachedInputTokens: 0,
        },
        finishReason: 'tool-calls',
      },
    },
    {
      event: StreamEventTypes.Latitude,
      data: {
        type: ChainEventTypes.StepCompleted,
        timestamp: 965044800000,
        uuid: TOOLS_DOCUMENT_UUID,
        messages: [
          {
            role: MessageRole.system,
            content: [
              {
                type: 'text',
                text: "You are a concerned mom. If the temperature is low, make recommendations to put on clothes, and if it's hot and sunny, be careful with so much exposure!\n\nBefore saying anything to the user, you must now their location and the current weather!\n\nIMPORTANT: Use exactly the names pased in the parameters for the locations. Do not add extra information.",
              },
              {
                type: 'text',
                text: 'First, locate the one or many recommendation requests.',
              },
            ],
          },
          {
            role: MessageRole.user,
            content: [
              {
                type: 'text',
                text: "Hi mom! I'm currently in Barcelona and Miami and Andrés is in Boston! Can you give us tips on what clothes we should put on?",
              },
            ],
          },
          {
            role: MessageRole.assistant,
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call_NCVUjMa6MeqDuj2bicbYOV1L',
                toolName: 'get_coordinates',
                args: {
                  location: 'Barcelona',
                },
              },
              {
                type: 'tool-call',
                toolCallId: 'call_KTPRHMRYPCF6NisrKhLxevEf',
                toolName: 'get_coordinates',
                args: {
                  location: 'Miami',
                },
              },
              {
                type: 'tool-call',
                toolCallId: 'call_LRmAwTyy8NXChQo6reGll0tG',
                toolName: 'get_coordinates',
                args: {
                  location: 'Boston',
                },
              },
            ],
            toolCalls: [
              {
                id: 'call_NCVUjMa6MeqDuj2bicbYOV1L',
                name: 'get_coordinates',
                arguments: {
                  location: 'Barcelona',
                },
              },
              {
                id: 'call_KTPRHMRYPCF6NisrKhLxevEf',
                name: 'get_coordinates',
                arguments: {
                  location: 'Miami',
                },
              },
              {
                id: 'call_LRmAwTyy8NXChQo6reGll0tG',
                name: 'get_coordinates',
                arguments: {
                  location: 'Boston',
                },
              },
            ],
          },
          {
            role: MessageRole.tool,
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_NCVUjMa6MeqDuj2bicbYOV1L',
                toolName: 'get_coordinates',
                result: {
                  latitude: '41.3851',
                  longitude: '2.1734',
                },
                isError: false,
              },
            ],
          },
          {
            role: MessageRole.tool,
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_KTPRHMRYPCF6NisrKhLxevEf',
                toolName: 'get_coordinates',
                result: {
                  latitude: '25.7617',
                  longitude: '-80.1918',
                },
                isError: false,
              },
            ],
          },
          {
            role: MessageRole.tool,
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_LRmAwTyy8NXChQo6reGll0tG',
                toolName: 'get_coordinates',
                result: {
                  latitude: '42.3601',
                  longitude: '-71.0589',
                },
                isError: false,
              },
            ],
          },
          {
            role: MessageRole.system,
            content: [
              {
                type: 'text',
                text: 'Now get the weather from the one or many recommendation requests.',
              },
            ],
          },
          {
            role: MessageRole.assistant,
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call_CtgG80sOeYxUGR5J0Y0ZOiKF',
                toolName: 'get_weather',
                args: {
                  latitude: '41.3851',
                  longitude: '2.1734',
                },
              },
              {
                type: 'tool-call',
                toolCallId: 'call_AkTTcOQFhomjshMlgR4IDZ4m',
                toolName: 'get_weather',
                args: {
                  latitude: '25.7617',
                  longitude: '-80.1918',
                },
              },
              {
                type: 'tool-call',
                toolCallId: 'call_GzO72dVu3qf1cOBWVgsNQvUw',
                toolName: 'get_weather',
                args: {
                  latitude: '42.3601',
                  longitude: '-71.0589',
                },
              },
            ],
            toolCalls: [
              {
                id: 'call_CtgG80sOeYxUGR5J0Y0ZOiKF',
                name: 'get_weather',
                arguments: {
                  latitude: '41.3851',
                  longitude: '2.1734',
                },
              },
              {
                id: 'call_AkTTcOQFhomjshMlgR4IDZ4m',
                name: 'get_weather',
                arguments: {
                  latitude: '25.7617',
                  longitude: '-80.1918',
                },
              },
              {
                id: 'call_GzO72dVu3qf1cOBWVgsNQvUw',
                name: 'get_weather',
                arguments: {
                  latitude: '42.3601',
                  longitude: '-71.0589',
                },
              },
            ],
          },
        ],
      },
    },
  ],
  chatEventsLast: [
    {
      event: StreamEventTypes.Latitude,
      data: {
        type: ChainEventTypes.ChainStarted,
        timestamp: 965044800000,
        uuid: TOOLS_DOCUMENT_UUID,
        messages: [
          {
            role: MessageRole.system,
            content: [
              {
                type: 'text',
                text: "You are a concerned mom. If the temperature is low, make recommendations to put on clothes, and if it's hot and sunny, be careful with so much exposure!\n\nBefore saying anything to the user, you must now their location and the current weather!\n\nIMPORTANT: Use exactly the names pased in the parameters for the locations. Do not add extra information.",
              },
              {
                type: 'text',
                text: 'First, locate the one or many recommendation requests.',
              },
            ],
          },
          {
            role: MessageRole.user,
            content: [
              {
                type: 'text',
                text: "Hi mom! I'm currently in Barcelona and Miami and Andrés is in Boston! Can you give us tips on what clothes we should put on?",
              },
            ],
          },
          {
            role: MessageRole.assistant,
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call_NCVUjMa6MeqDuj2bicbYOV1L',
                toolName: 'get_coordinates',
                args: {
                  location: 'Barcelona',
                },
              },
              {
                type: 'tool-call',
                toolCallId: 'call_KTPRHMRYPCF6NisrKhLxevEf',
                toolName: 'get_coordinates',
                args: {
                  location: 'Miami',
                },
              },
              {
                type: 'tool-call',
                toolCallId: 'call_LRmAwTyy8NXChQo6reGll0tG',
                toolName: 'get_coordinates',
                args: {
                  location: 'Boston',
                },
              },
            ],
            toolCalls: [
              {
                id: 'call_NCVUjMa6MeqDuj2bicbYOV1L',
                name: 'get_coordinates',
                arguments: {
                  location: 'Barcelona',
                },
              },
              {
                id: 'call_KTPRHMRYPCF6NisrKhLxevEf',
                name: 'get_coordinates',
                arguments: {
                  location: 'Miami',
                },
              },
              {
                id: 'call_LRmAwTyy8NXChQo6reGll0tG',
                name: 'get_coordinates',
                arguments: {
                  location: 'Boston',
                },
              },
            ],
          },
          {
            role: MessageRole.tool,
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_NCVUjMa6MeqDuj2bicbYOV1L',
                toolName: 'get_coordinates',
                result: {
                  latitude: '41.3851',
                  longitude: '2.1734',
                },
                isError: false,
              },
            ],
          },
          {
            role: MessageRole.tool,
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_KTPRHMRYPCF6NisrKhLxevEf',
                toolName: 'get_coordinates',
                result: {
                  latitude: '25.7617',
                  longitude: '-80.1918',
                },
                isError: false,
              },
            ],
          },
          {
            role: MessageRole.tool,
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_LRmAwTyy8NXChQo6reGll0tG',
                toolName: 'get_coordinates',
                result: {
                  latitude: '42.3601',
                  longitude: '-71.0589',
                },
                isError: false,
              },
            ],
          },
          {
            role: MessageRole.system,
            content: [
              {
                type: 'text',
                text: 'Now get the weather from the one or many recommendation requests.',
              },
            ],
          },
          {
            role: MessageRole.assistant,
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call_CtgG80sOeYxUGR5J0Y0ZOiKF',
                toolName: 'get_weather',
                args: {
                  latitude: '41.3851',
                  longitude: '2.1734',
                },
              },
              {
                type: 'tool-call',
                toolCallId: 'call_AkTTcOQFhomjshMlgR4IDZ4m',
                toolName: 'get_weather',
                args: {
                  latitude: '25.7617',
                  longitude: '-80.1918',
                },
              },
              {
                type: 'tool-call',
                toolCallId: 'call_GzO72dVu3qf1cOBWVgsNQvUw',
                toolName: 'get_weather',
                args: {
                  latitude: '42.3601',
                  longitude: '-71.0589',
                },
              },
            ],
            toolCalls: [
              {
                id: 'call_CtgG80sOeYxUGR5J0Y0ZOiKF',
                name: 'get_weather',
                arguments: {
                  latitude: '41.3851',
                  longitude: '2.1734',
                },
              },
              {
                id: 'call_AkTTcOQFhomjshMlgR4IDZ4m',
                name: 'get_weather',
                arguments: {
                  latitude: '25.7617',
                  longitude: '-80.1918',
                },
              },
              {
                id: 'call_GzO72dVu3qf1cOBWVgsNQvUw',
                name: 'get_weather',
                arguments: {
                  latitude: '42.3601',
                  longitude: '-71.0589',
                },
              },
            ],
          },
        ],
      },
    },
    {
      event: StreamEventTypes.Latitude,
      data: {
        type: ChainEventTypes.StepStarted,
        timestamp: 965044800000,
        uuid: TOOLS_DOCUMENT_UUID,
        messages: [
          {
            role: MessageRole.system,
            content: [
              {
                type: 'text',
                text: "You are a concerned mom. If the temperature is low, make recommendations to put on clothes, and if it's hot and sunny, be careful with so much exposure!\n\nBefore saying anything to the user, you must now their location and the current weather!\n\nIMPORTANT: Use exactly the names pased in the parameters for the locations. Do not add extra information.",
              },
              {
                type: 'text',
                text: 'First, locate the one or many recommendation requests.',
              },
            ],
          },
          {
            role: MessageRole.user,
            content: [
              {
                type: 'text',
                text: "Hi mom! I'm currently in Barcelona and Miami and Andrés is in Boston! Can you give us tips on what clothes we should put on?",
              },
            ],
          },
          {
            role: MessageRole.assistant,
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call_NCVUjMa6MeqDuj2bicbYOV1L',
                toolName: 'get_coordinates',
                args: {
                  location: 'Barcelona',
                },
              },
              {
                type: 'tool-call',
                toolCallId: 'call_KTPRHMRYPCF6NisrKhLxevEf',
                toolName: 'get_coordinates',
                args: {
                  location: 'Miami',
                },
              },
              {
                type: 'tool-call',
                toolCallId: 'call_LRmAwTyy8NXChQo6reGll0tG',
                toolName: 'get_coordinates',
                args: {
                  location: 'Boston',
                },
              },
            ],
            toolCalls: [
              {
                id: 'call_NCVUjMa6MeqDuj2bicbYOV1L',
                name: 'get_coordinates',
                arguments: {
                  location: 'Barcelona',
                },
              },
              {
                id: 'call_KTPRHMRYPCF6NisrKhLxevEf',
                name: 'get_coordinates',
                arguments: {
                  location: 'Miami',
                },
              },
              {
                id: 'call_LRmAwTyy8NXChQo6reGll0tG',
                name: 'get_coordinates',
                arguments: {
                  location: 'Boston',
                },
              },
            ],
          },
          {
            role: MessageRole.tool,
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_NCVUjMa6MeqDuj2bicbYOV1L',
                toolName: 'get_coordinates',
                result: {
                  latitude: '41.3851',
                  longitude: '2.1734',
                },
                isError: false,
              },
            ],
          },
          {
            role: MessageRole.tool,
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_KTPRHMRYPCF6NisrKhLxevEf',
                toolName: 'get_coordinates',
                result: {
                  latitude: '25.7617',
                  longitude: '-80.1918',
                },
                isError: false,
              },
            ],
          },
          {
            role: MessageRole.tool,
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_LRmAwTyy8NXChQo6reGll0tG',
                toolName: 'get_coordinates',
                result: {
                  latitude: '42.3601',
                  longitude: '-71.0589',
                },
                isError: false,
              },
            ],
          },
          {
            role: MessageRole.system,
            content: [
              {
                type: 'text',
                text: 'Now get the weather from the one or many recommendation requests.',
              },
            ],
          },
          {
            role: MessageRole.assistant,
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call_CtgG80sOeYxUGR5J0Y0ZOiKF',
                toolName: 'get_weather',
                args: {
                  latitude: '41.3851',
                  longitude: '2.1734',
                },
              },
              {
                type: 'tool-call',
                toolCallId: 'call_AkTTcOQFhomjshMlgR4IDZ4m',
                toolName: 'get_weather',
                args: {
                  latitude: '25.7617',
                  longitude: '-80.1918',
                },
              },
              {
                type: 'tool-call',
                toolCallId: 'call_GzO72dVu3qf1cOBWVgsNQvUw',
                toolName: 'get_weather',
                args: {
                  latitude: '42.3601',
                  longitude: '-71.0589',
                },
              },
            ],
            toolCalls: [
              {
                id: 'call_CtgG80sOeYxUGR5J0Y0ZOiKF',
                name: 'get_weather',
                arguments: {
                  latitude: '41.3851',
                  longitude: '2.1734',
                },
              },
              {
                id: 'call_AkTTcOQFhomjshMlgR4IDZ4m',
                name: 'get_weather',
                arguments: {
                  latitude: '25.7617',
                  longitude: '-80.1918',
                },
              },
              {
                id: 'call_GzO72dVu3qf1cOBWVgsNQvUw',
                name: 'get_weather',
                arguments: {
                  latitude: '42.3601',
                  longitude: '-71.0589',
                },
              },
            ],
          },
          {
            role: MessageRole.tool,
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_CtgG80sOeYxUGR5J0Y0ZOiKF',
                toolName: 'get_weather',
                result: {
                  temperature: 24,
                  weather: 'Clear',
                },
                isError: false,
              },
            ],
          },
          {
            role: MessageRole.tool,
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_AkTTcOQFhomjshMlgR4IDZ4m',
                toolName: 'get_weather',
                result: {
                  temperature: 30,
                  weather: 'Clear',
                },
                isError: false,
              },
            ],
          },
          {
            role: MessageRole.tool,
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_GzO72dVu3qf1cOBWVgsNQvUw',
                toolName: 'get_weather',
                result: {
                  temperature: 10,
                  weather: 'Clear',
                },
                isError: false,
              },
            ],
          },
          {
            role: MessageRole.system,
            content: [
              {
                type: 'text',
                text: 'Now make the recommendations based on the weather.',
              },
            ],
          },
        ],
      },
    },
    {
      event: StreamEventTypes.Latitude,
      data: {
        type: ChainEventTypes.ProviderStarted,
        timestamp: 965044800000,
        uuid: TOOLS_DOCUMENT_UUID,
        messages: [
          {
            role: MessageRole.system,
            content: [
              {
                type: 'text',
                text: "You are a concerned mom. If the temperature is low, make recommendations to put on clothes, and if it's hot and sunny, be careful with so much exposure!\n\nBefore saying anything to the user, you must now their location and the current weather!\n\nIMPORTANT: Use exactly the names pased in the parameters for the locations. Do not add extra information.",
              },
              {
                type: 'text',
                text: 'First, locate the one or many recommendation requests.',
              },
            ],
          },
          {
            role: MessageRole.user,
            content: [
              {
                type: 'text',
                text: "Hi mom! I'm currently in Barcelona and Miami and Andrés is in Boston! Can you give us tips on what clothes we should put on?",
              },
            ],
          },
          {
            role: MessageRole.assistant,
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call_NCVUjMa6MeqDuj2bicbYOV1L',
                toolName: 'get_coordinates',
                args: {
                  location: 'Barcelona',
                },
              },
              {
                type: 'tool-call',
                toolCallId: 'call_KTPRHMRYPCF6NisrKhLxevEf',
                toolName: 'get_coordinates',
                args: {
                  location: 'Miami',
                },
              },
              {
                type: 'tool-call',
                toolCallId: 'call_LRmAwTyy8NXChQo6reGll0tG',
                toolName: 'get_coordinates',
                args: {
                  location: 'Boston',
                },
              },
            ],
            toolCalls: [
              {
                id: 'call_NCVUjMa6MeqDuj2bicbYOV1L',
                name: 'get_coordinates',
                arguments: {
                  location: 'Barcelona',
                },
              },
              {
                id: 'call_KTPRHMRYPCF6NisrKhLxevEf',
                name: 'get_coordinates',
                arguments: {
                  location: 'Miami',
                },
              },
              {
                id: 'call_LRmAwTyy8NXChQo6reGll0tG',
                name: 'get_coordinates',
                arguments: {
                  location: 'Boston',
                },
              },
            ],
          },
          {
            role: MessageRole.tool,
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_NCVUjMa6MeqDuj2bicbYOV1L',
                toolName: 'get_coordinates',
                result: {
                  latitude: '41.3851',
                  longitude: '2.1734',
                },
                isError: false,
              },
            ],
          },
          {
            role: MessageRole.tool,
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_KTPRHMRYPCF6NisrKhLxevEf',
                toolName: 'get_coordinates',
                result: {
                  latitude: '25.7617',
                  longitude: '-80.1918',
                },
                isError: false,
              },
            ],
          },
          {
            role: MessageRole.tool,
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_LRmAwTyy8NXChQo6reGll0tG',
                toolName: 'get_coordinates',
                result: {
                  latitude: '42.3601',
                  longitude: '-71.0589',
                },
                isError: false,
              },
            ],
          },
          {
            role: MessageRole.system,
            content: [
              {
                type: 'text',
                text: 'Now get the weather from the one or many recommendation requests.',
              },
            ],
          },
          {
            role: MessageRole.assistant,
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call_CtgG80sOeYxUGR5J0Y0ZOiKF',
                toolName: 'get_weather',
                args: {
                  latitude: '41.3851',
                  longitude: '2.1734',
                },
              },
              {
                type: 'tool-call',
                toolCallId: 'call_AkTTcOQFhomjshMlgR4IDZ4m',
                toolName: 'get_weather',
                args: {
                  latitude: '25.7617',
                  longitude: '-80.1918',
                },
              },
              {
                type: 'tool-call',
                toolCallId: 'call_GzO72dVu3qf1cOBWVgsNQvUw',
                toolName: 'get_weather',
                args: {
                  latitude: '42.3601',
                  longitude: '-71.0589',
                },
              },
            ],
            toolCalls: [
              {
                id: 'call_CtgG80sOeYxUGR5J0Y0ZOiKF',
                name: 'get_weather',
                arguments: {
                  latitude: '41.3851',
                  longitude: '2.1734',
                },
              },
              {
                id: 'call_AkTTcOQFhomjshMlgR4IDZ4m',
                name: 'get_weather',
                arguments: {
                  latitude: '25.7617',
                  longitude: '-80.1918',
                },
              },
              {
                id: 'call_GzO72dVu3qf1cOBWVgsNQvUw',
                name: 'get_weather',
                arguments: {
                  latitude: '42.3601',
                  longitude: '-71.0589',
                },
              },
            ],
          },
          {
            role: MessageRole.tool,
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_CtgG80sOeYxUGR5J0Y0ZOiKF',
                toolName: 'get_weather',
                result: {
                  temperature: 24,
                  weather: 'Clear',
                },
                isError: false,
              },
            ],
          },
          {
            role: MessageRole.tool,
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_AkTTcOQFhomjshMlgR4IDZ4m',
                toolName: 'get_weather',
                result: {
                  temperature: 30,
                  weather: 'Clear',
                },
                isError: false,
              },
            ],
          },
          {
            role: MessageRole.tool,
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_GzO72dVu3qf1cOBWVgsNQvUw',
                toolName: 'get_weather',
                result: {
                  temperature: 10,
                  weather: 'Clear',
                },
                isError: false,
              },
            ],
          },
          {
            role: MessageRole.system,
            content: [
              {
                type: 'text',
                text: 'Now make the recommendations based on the weather.',
              },
            ],
          },
        ],
        config: {},
      },
    },
    {
      event: StreamEventTypes.Latitude,
      data: {
        type: ChainEventTypes.ProviderCompleted,
        timestamp: 965044800000,
        uuid: TOOLS_DOCUMENT_UUID,
        messages: [
          {
            role: MessageRole.system,
            content: [
              {
                type: 'text',
                text: "You are a concerned mom. If the temperature is low, make recommendations to put on clothes, and if it's hot and sunny, be careful with so much exposure!\n\nBefore saying anything to the user, you must now their location and the current weather!\n\nIMPORTANT: Use exactly the names pased in the parameters for the locations. Do not add extra information.",
              },
              {
                type: 'text',
                text: 'First, locate the one or many recommendation requests.',
              },
            ],
          },
          {
            role: MessageRole.user,
            content: [
              {
                type: 'text',
                text: "Hi mom! I'm currently in Barcelona and Miami and Andrés is in Boston! Can you give us tips on what clothes we should put on?",
              },
            ],
          },
          {
            role: MessageRole.assistant,
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call_NCVUjMa6MeqDuj2bicbYOV1L',
                toolName: 'get_coordinates',
                args: {
                  location: 'Barcelona',
                },
              },
              {
                type: 'tool-call',
                toolCallId: 'call_KTPRHMRYPCF6NisrKhLxevEf',
                toolName: 'get_coordinates',
                args: {
                  location: 'Miami',
                },
              },
              {
                type: 'tool-call',
                toolCallId: 'call_LRmAwTyy8NXChQo6reGll0tG',
                toolName: 'get_coordinates',
                args: {
                  location: 'Boston',
                },
              },
            ],
            toolCalls: [
              {
                id: 'call_NCVUjMa6MeqDuj2bicbYOV1L',
                name: 'get_coordinates',
                arguments: {
                  location: 'Barcelona',
                },
              },
              {
                id: 'call_KTPRHMRYPCF6NisrKhLxevEf',
                name: 'get_coordinates',
                arguments: {
                  location: 'Miami',
                },
              },
              {
                id: 'call_LRmAwTyy8NXChQo6reGll0tG',
                name: 'get_coordinates',
                arguments: {
                  location: 'Boston',
                },
              },
            ],
          },
          {
            role: MessageRole.tool,
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_NCVUjMa6MeqDuj2bicbYOV1L',
                toolName: 'get_coordinates',
                result: {
                  latitude: '41.3851',
                  longitude: '2.1734',
                },
                isError: false,
              },
            ],
          },
          {
            role: MessageRole.tool,
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_KTPRHMRYPCF6NisrKhLxevEf',
                toolName: 'get_coordinates',
                result: {
                  latitude: '25.7617',
                  longitude: '-80.1918',
                },
                isError: false,
              },
            ],
          },
          {
            role: MessageRole.tool,
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_LRmAwTyy8NXChQo6reGll0tG',
                toolName: 'get_coordinates',
                result: {
                  latitude: '42.3601',
                  longitude: '-71.0589',
                },
                isError: false,
              },
            ],
          },
          {
            role: MessageRole.system,
            content: [
              {
                type: 'text',
                text: 'Now get the weather from the one or many recommendation requests.',
              },
            ],
          },
          {
            role: MessageRole.assistant,
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call_CtgG80sOeYxUGR5J0Y0ZOiKF',
                toolName: 'get_weather',
                args: {
                  latitude: '41.3851',
                  longitude: '2.1734',
                },
              },
              {
                type: 'tool-call',
                toolCallId: 'call_AkTTcOQFhomjshMlgR4IDZ4m',
                toolName: 'get_weather',
                args: {
                  latitude: '25.7617',
                  longitude: '-80.1918',
                },
              },
              {
                type: 'tool-call',
                toolCallId: 'call_GzO72dVu3qf1cOBWVgsNQvUw',
                toolName: 'get_weather',
                args: {
                  latitude: '42.3601',
                  longitude: '-71.0589',
                },
              },
            ],
            toolCalls: [
              {
                id: 'call_CtgG80sOeYxUGR5J0Y0ZOiKF',
                name: 'get_weather',
                arguments: {
                  latitude: '41.3851',
                  longitude: '2.1734',
                },
              },
              {
                id: 'call_AkTTcOQFhomjshMlgR4IDZ4m',
                name: 'get_weather',
                arguments: {
                  latitude: '25.7617',
                  longitude: '-80.1918',
                },
              },
              {
                id: 'call_GzO72dVu3qf1cOBWVgsNQvUw',
                name: 'get_weather',
                arguments: {
                  latitude: '42.3601',
                  longitude: '-71.0589',
                },
              },
            ],
          },
          {
            role: MessageRole.tool,
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_CtgG80sOeYxUGR5J0Y0ZOiKF',
                toolName: 'get_weather',
                result: {
                  temperature: 24,
                  weather: 'Clear',
                },
                isError: false,
              },
            ],
          },
          {
            role: MessageRole.tool,
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_AkTTcOQFhomjshMlgR4IDZ4m',
                toolName: 'get_weather',
                result: {
                  temperature: 30,
                  weather: 'Clear',
                },
                isError: false,
              },
            ],
          },
          {
            role: MessageRole.tool,
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_GzO72dVu3qf1cOBWVgsNQvUw',
                toolName: 'get_weather',
                result: {
                  temperature: 10,
                  weather: 'Clear',
                },
                isError: false,
              },
            ],
          },
          {
            role: MessageRole.system,
            content: [
              {
                type: 'text',
                text: 'Now make the recommendations based on the weather.',
              },
            ],
          },
          {
            role: MessageRole.assistant,
            content: [
              {
                type: 'text',
                text: "- **Barcelona**: It's 24°C, so I recommend wearing light layers, like a t-shirt with a light jacket or cardigan, especially if you're going to be out in the evening.\n\n- **Miami**: It's hot at 30°C! Make sure to wear light, breathable clothing, and don't forget sunscreen and a hat to protect yourself from the sun.\n\n- **Boston**: It's quite chilly at 10°C. Please wear warm clothes, like a sweater or a jacket, and consider a scarf and gloves if you'll be outside for a while.",
              },
            ],
            toolCalls: [],
          },
        ],
        response: {
          streamType: 'text',
          documentLogUuid: TOOLS_DOCUMENT_UUID,
          text: "- **Barcelona**: It's 24°C, so I recommend wearing light layers, like a t-shirt with a light jacket or cardigan, especially if you're going to be out in the evening.\n\n- **Miami**: It's hot at 30°C! Make sure to wear light, breathable clothing, and don't forget sunscreen and a hat to protect yourself from the sun.\n\n- **Boston**: It's quite chilly at 10°C. Please wear warm clothes, like a sweater or a jacket, and consider a scarf and gloves if you'll be outside for a while.",
          usage: {
            inputTokens: 523,
            outputTokens: 115,
            promptTokens: 523,
            completionTokens: 115,
            totalTokens: 638,
            reasoningTokens: 0,
            cachedInputTokens: 0,
          },
          toolCalls: [],
        },
        providerLogUuid: '789',
        finishReason: 'stop',
        tokenUsage: {
          inputTokens: 523,
          outputTokens: 115,
          promptTokens: 523,
          completionTokens: 115,
          totalTokens: 638,
          reasoningTokens: 0,
          cachedInputTokens: 0,
        },
      },
    },
    {
      event: StreamEventTypes.Latitude,
      data: {
        type: ChainEventTypes.StepCompleted,
        timestamp: 965044800000,
        uuid: TOOLS_DOCUMENT_UUID,
        messages: [
          {
            role: MessageRole.system,
            content: [
              {
                type: 'text',
                text: "You are a concerned mom. If the temperature is low, make recommendations to put on clothes, and if it's hot and sunny, be careful with so much exposure!\n\nBefore saying anything to the user, you must now their location and the current weather!\n\nIMPORTANT: Use exactly the names pased in the parameters for the locations. Do not add extra information.",
              },
              {
                type: 'text',
                text: 'First, locate the one or many recommendation requests.',
              },
            ],
          },
          {
            role: MessageRole.user,
            content: [
              {
                type: 'text',
                text: "Hi mom! I'm currently in Barcelona and Miami and Andrés is in Boston! Can you give us tips on what clothes we should put on?",
              },
            ],
          },
          {
            role: MessageRole.assistant,
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call_NCVUjMa6MeqDuj2bicbYOV1L',
                toolName: 'get_coordinates',
                args: {
                  location: 'Barcelona',
                },
              },
              {
                type: 'tool-call',
                toolCallId: 'call_KTPRHMRYPCF6NisrKhLxevEf',
                toolName: 'get_coordinates',
                args: {
                  location: 'Miami',
                },
              },
              {
                type: 'tool-call',
                toolCallId: 'call_LRmAwTyy8NXChQo6reGll0tG',
                toolName: 'get_coordinates',
                args: {
                  location: 'Boston',
                },
              },
            ],
            toolCalls: [
              {
                id: 'call_NCVUjMa6MeqDuj2bicbYOV1L',
                name: 'get_coordinates',
                arguments: {
                  location: 'Barcelona',
                },
              },
              {
                id: 'call_KTPRHMRYPCF6NisrKhLxevEf',
                name: 'get_coordinates',
                arguments: {
                  location: 'Miami',
                },
              },
              {
                id: 'call_LRmAwTyy8NXChQo6reGll0tG',
                name: 'get_coordinates',
                arguments: {
                  location: 'Boston',
                },
              },
            ],
          },
          {
            role: MessageRole.tool,
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_NCVUjMa6MeqDuj2bicbYOV1L',
                toolName: 'get_coordinates',
                result: {
                  latitude: '41.3851',
                  longitude: '2.1734',
                },
                isError: false,
              },
            ],
          },
          {
            role: MessageRole.tool,
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_KTPRHMRYPCF6NisrKhLxevEf',
                toolName: 'get_coordinates',
                result: {
                  latitude: '25.7617',
                  longitude: '-80.1918',
                },
                isError: false,
              },
            ],
          },
          {
            role: MessageRole.tool,
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_LRmAwTyy8NXChQo6reGll0tG',
                toolName: 'get_coordinates',
                result: {
                  latitude: '42.3601',
                  longitude: '-71.0589',
                },
                isError: false,
              },
            ],
          },
          {
            role: MessageRole.system,
            content: [
              {
                type: 'text',
                text: 'Now get the weather from the one or many recommendation requests.',
              },
            ],
          },
          {
            role: MessageRole.assistant,
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call_CtgG80sOeYxUGR5J0Y0ZOiKF',
                toolName: 'get_weather',
                args: {
                  latitude: '41.3851',
                  longitude: '2.1734',
                },
              },
              {
                type: 'tool-call',
                toolCallId: 'call_AkTTcOQFhomjshMlgR4IDZ4m',
                toolName: 'get_weather',
                args: {
                  latitude: '25.7617',
                  longitude: '-80.1918',
                },
              },
              {
                type: 'tool-call',
                toolCallId: 'call_GzO72dVu3qf1cOBWVgsNQvUw',
                toolName: 'get_weather',
                args: {
                  latitude: '42.3601',
                  longitude: '-71.0589',
                },
              },
            ],
            toolCalls: [
              {
                id: 'call_CtgG80sOeYxUGR5J0Y0ZOiKF',
                name: 'get_weather',
                arguments: {
                  latitude: '41.3851',
                  longitude: '2.1734',
                },
              },
              {
                id: 'call_AkTTcOQFhomjshMlgR4IDZ4m',
                name: 'get_weather',
                arguments: {
                  latitude: '25.7617',
                  longitude: '-80.1918',
                },
              },
              {
                id: 'call_GzO72dVu3qf1cOBWVgsNQvUw',
                name: 'get_weather',
                arguments: {
                  latitude: '42.3601',
                  longitude: '-71.0589',
                },
              },
            ],
          },
          {
            role: MessageRole.tool,
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_CtgG80sOeYxUGR5J0Y0ZOiKF',
                toolName: 'get_weather',
                result: {
                  temperature: 24,
                  weather: 'Clear',
                },
                isError: false,
              },
            ],
          },
          {
            role: MessageRole.tool,
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_AkTTcOQFhomjshMlgR4IDZ4m',
                toolName: 'get_weather',
                result: {
                  temperature: 30,
                  weather: 'Clear',
                },
                isError: false,
              },
            ],
          },
          {
            role: MessageRole.tool,
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_GzO72dVu3qf1cOBWVgsNQvUw',
                toolName: 'get_weather',
                result: {
                  temperature: 10,
                  weather: 'Clear',
                },
                isError: false,
              },
            ],
          },
          {
            role: MessageRole.system,
            content: [
              {
                type: 'text',
                text: 'Now make the recommendations based on the weather.',
              },
            ],
          },
          {
            role: MessageRole.assistant,
            content: [
              {
                type: 'text',
                text: "- **Barcelona**: It's 24°C, so I recommend wearing light layers, like a t-shirt with a light jacket or cardigan, especially if you're going to be out in the evening.\n\n- **Miami**: It's hot at 30°C! Make sure to wear light, breathable clothing, and don't forget sunscreen and a hat to protect yourself from the sun.\n\n- **Boston**: It's quite chilly at 10°C. Please wear warm clothes, like a sweater or a jacket, and consider a scarf and gloves if you'll be outside for a while.",
              },
            ],
            toolCalls: [],
          },
        ],
      },
    },
    {
      event: StreamEventTypes.Latitude,
      data: {
        type: ChainEventTypes.ChainCompleted,
        timestamp: 965044800000,
        uuid: TOOLS_DOCUMENT_UUID,
        tokenUsage: {
          inputTokens: 523,
          outputTokens: 115,
          promptTokens: 523,
          completionTokens: 115,
          totalTokens: 638,
          reasoningTokens: 0,
          cachedInputTokens: 0,
        },
        response: undefined,
        toolCalls: [],
        finishReason: 'stop',
        messages: [
          {
            role: MessageRole.system,
            content: [
              {
                type: 'text',
                text: "You are a concerned mom. If the temperature is low, make recommendations to put on clothes, and if it's hot and sunny, be careful with so much exposure!\n\nBefore saying anything to the user, you must now their location and the current weather!\n\nIMPORTANT: Use exactly the names pased in the parameters for the locations. Do not add extra information.",
              },
              {
                type: 'text',
                text: 'First, locate the one or many recommendation requests.',
              },
            ],
          },
          {
            role: MessageRole.user,
            content: [
              {
                type: 'text',
                text: "Hi mom! I'm currently in Barcelona and Miami and Andrés is in Boston! Can you give us tips on what clothes we should put on?",
              },
            ],
          },
          {
            role: MessageRole.assistant,
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call_NCVUjMa6MeqDuj2bicbYOV1L',
                toolName: 'get_coordinates',
                args: {
                  location: 'Barcelona',
                },
              },
              {
                type: 'tool-call',
                toolCallId: 'call_KTPRHMRYPCF6NisrKhLxevEf',
                toolName: 'get_coordinates',
                args: {
                  location: 'Miami',
                },
              },
              {
                type: 'tool-call',
                toolCallId: 'call_LRmAwTyy8NXChQo6reGll0tG',
                toolName: 'get_coordinates',
                args: {
                  location: 'Boston',
                },
              },
            ],
            toolCalls: [
              {
                id: 'call_NCVUjMa6MeqDuj2bicbYOV1L',
                name: 'get_coordinates',
                arguments: {
                  location: 'Barcelona',
                },
              },
              {
                id: 'call_KTPRHMRYPCF6NisrKhLxevEf',
                name: 'get_coordinates',
                arguments: {
                  location: 'Miami',
                },
              },
              {
                id: 'call_LRmAwTyy8NXChQo6reGll0tG',
                name: 'get_coordinates',
                arguments: {
                  location: 'Boston',
                },
              },
            ],
          },
          {
            role: MessageRole.tool,
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_NCVUjMa6MeqDuj2bicbYOV1L',
                toolName: 'get_coordinates',
                result: {
                  latitude: '41.3851',
                  longitude: '2.1734',
                },
                isError: false,
              },
            ],
          },
          {
            role: MessageRole.tool,
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_KTPRHMRYPCF6NisrKhLxevEf',
                toolName: 'get_coordinates',
                result: {
                  latitude: '25.7617',
                  longitude: '-80.1918',
                },
                isError: false,
              },
            ],
          },
          {
            role: MessageRole.tool,
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_LRmAwTyy8NXChQo6reGll0tG',
                toolName: 'get_coordinates',
                result: {
                  latitude: '42.3601',
                  longitude: '-71.0589',
                },
                isError: false,
              },
            ],
          },
          {
            role: MessageRole.system,
            content: [
              {
                type: 'text',
                text: 'Now get the weather from the one or many recommendation requests.',
              },
            ],
          },
          {
            role: MessageRole.assistant,
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call_CtgG80sOeYxUGR5J0Y0ZOiKF',
                toolName: 'get_weather',
                args: {
                  latitude: '41.3851',
                  longitude: '2.1734',
                },
              },
              {
                type: 'tool-call',
                toolCallId: 'call_AkTTcOQFhomjshMlgR4IDZ4m',
                toolName: 'get_weather',
                args: {
                  latitude: '25.7617',
                  longitude: '-80.1918',
                },
              },
              {
                type: 'tool-call',
                toolCallId: 'call_GzO72dVu3qf1cOBWVgsNQvUw',
                toolName: 'get_weather',
                args: {
                  latitude: '42.3601',
                  longitude: '-71.0589',
                },
              },
            ],
            toolCalls: [
              {
                id: 'call_CtgG80sOeYxUGR5J0Y0ZOiKF',
                name: 'get_weather',
                arguments: {
                  latitude: '41.3851',
                  longitude: '2.1734',
                },
              },
              {
                id: 'call_AkTTcOQFhomjshMlgR4IDZ4m',
                name: 'get_weather',
                arguments: {
                  latitude: '25.7617',
                  longitude: '-80.1918',
                },
              },
              {
                id: 'call_GzO72dVu3qf1cOBWVgsNQvUw',
                name: 'get_weather',
                arguments: {
                  latitude: '42.3601',
                  longitude: '-71.0589',
                },
              },
            ],
          },
          {
            role: MessageRole.tool,
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_CtgG80sOeYxUGR5J0Y0ZOiKF',
                toolName: 'get_weather',
                result: {
                  temperature: 24,
                  weather: 'Clear',
                },
                isError: false,
              },
            ],
          },
          {
            role: MessageRole.tool,
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_AkTTcOQFhomjshMlgR4IDZ4m',
                toolName: 'get_weather',
                result: {
                  temperature: 30,
                  weather: 'Clear',
                },
                isError: false,
              },
            ],
          },
          {
            role: MessageRole.tool,
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_GzO72dVu3qf1cOBWVgsNQvUw',
                toolName: 'get_weather',
                result: {
                  temperature: 10,
                  weather: 'Clear',
                },
                isError: false,
              },
            ],
          },
          {
            role: MessageRole.system,
            content: [
              {
                type: 'text',
                text: 'Now make the recommendations based on the weather.',
              },
            ],
          },
          {
            role: MessageRole.assistant,
            content: [
              {
                type: 'text',
                text: "- **Barcelona**: It's 24°C, so I recommend wearing light layers, like a t-shirt with a light jacket or cardigan, especially if you're going to be out in the evening.\n\n- **Miami**: It's hot at 30°C! Make sure to wear light, breathable clothing, and don't forget sunscreen and a hat to protect yourself from the sun.\n\n- **Boston**: It's quite chilly at 10°C. Please wear warm clothes, like a sweater or a jacket, and consider a scarf and gloves if you'll be outside for a while.",
              },
            ],
            toolCalls: [],
          },
        ],
      },
    },
  ],
}

export const TOOL_EVENTS = {
  runEvents: TOOL_EVENTS_OBJECT.runEvents.map(
    (e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`,
  ),
  chatEventsFirst: TOOL_EVENTS_OBJECT.chatEventsFirst.map(
    (e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`,
  ),
  chatEventsLast: TOOL_EVENTS_OBJECT.chatEventsLast.map(
    (e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`,
  ),
}
