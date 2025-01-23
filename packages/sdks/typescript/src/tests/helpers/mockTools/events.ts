export const TOOLS_DOCUMENT_UUID = '02e6ac23-a43b-4c3a-aedc-41b7d5e26a1b'
export const TOOL_EVENTS_OBJECT = {
  runEvents: [
    {
      event: 'latitude-event',
      data: {
        type: 'chain-step',
        messages: [
          {
            role: 'system',
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
            role: 'user',
            content: [
              {
                type: 'text',
                text: "Hi mom! I'm currently in Barcelona and Miami and Andrés is in Boston! Can you give us tips on what clothes we should put on?",
              },
            ],
          },
        ],
        uuid: '02e6ac23-a43b-4c3a-aedc-41b7d5e26a1b',
      },
    },
    {
      event: 'latitude-event',
      data: {
        type: 'chain-step-complete',
        response: {
          streamType: 'text',
          documentLogUuid: '02e6ac23-a43b-4c3a-aedc-41b7d5e26a1b',
          text: '',
          usage: {
            promptTokens: 251,
            completionTokens: 59,
            totalTokens: 310,
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
        uuid: '02e6ac23-a43b-4c3a-aedc-41b7d5e26a1b',
      },
    },
    {
      event: 'latitude-event',
      data: {
        type: 'chain-complete',
        response: {
          streamType: 'text',
          text: '',
          usage: {
            promptTokens: 251,
            completionTokens: 59,
            totalTokens: 310,
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
        messages: [
          {
            role: 'assistant',
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
        finishReason: 'tool-calls',
        uuid: TOOLS_DOCUMENT_UUID,
      },
    },
  ],
  chatEventsFirst: [
    {
      event: 'latitude-event',
      data: {
        type: 'chain-step',
        messages: [
          {
            role: 'system',
            content: [
              {
                type: 'text',
                text: 'Now get the weather from the one or many recommendation requests.',
                _promptlSourceMap: [],
              },
            ],
          },
        ],
        uuid: TOOLS_DOCUMENT_UUID,
      },
    },
    {
      event: 'latitude-event',
      data: {
        type: 'chain-step-complete',
        response: {
          streamType: 'text',
          documentLogUuid: TOOLS_DOCUMENT_UUID,
          text: '',
          usage: {
            promptTokens: 391,
            completionTokens: 91,
            totalTokens: 482,
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
        uuid: TOOLS_DOCUMENT_UUID,
      },
    },
    {
      event: 'latitude-event',
      data: {
        type: 'chain-complete',
        response: {
          streamType: 'text',
          text: '',
          usage: {
            promptTokens: 391,
            completionTokens: 91,
            totalTokens: 482,
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
        messages: [
          {
            role: 'assistant',
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
        finishReason: 'tool-calls',
        uuid: TOOLS_DOCUMENT_UUID,
      },
    },
  ],
  chatEventsLast: [
    {
      event: 'latitude-event',
      data: {
        type: 'chain-step',
        messages: [
          {
            role: 'system',
            content: [
              {
                type: 'text',
                text: 'Now make the recommendations based on the weather.',
                _promptlSourceMap: [],
              },
            ],
          },
        ],
        uuid: TOOLS_DOCUMENT_UUID,
      },
    },
    {
      event: 'latitude-event',
      data: {
        type: 'chain-step-complete',
        response: {
          streamType: 'text',
          documentLogUuid: TOOLS_DOCUMENT_UUID,
          text: "- **Barcelona**: It's 24°C, so I recommend wearing light layers, like a t-shirt with a light jacket or cardigan, especially if you're going to be out in the evening.\n\n- **Miami**: It's hot at 30°C! Make sure to wear light, breathable clothing, and don't forget sunscreen and a hat to protect yourself from the sun.\n\n- **Boston**: It's quite chilly at 10°C. Please wear warm clothes, like a sweater or a jacket, and consider a scarf and gloves if you'll be outside for a while.",
          usage: {
            promptTokens: 523,
            completionTokens: 115,
            totalTokens: 638,
          },
          toolCalls: [],
        },
        uuid: TOOLS_DOCUMENT_UUID,
      },
    },
    {
      event: 'latitude-event',
      data: {
        type: 'chain-complete',
        response: {
          streamType: 'text',
          text: "- **Barcelona**: It's 24°C, so I recommend wearing light layers, like a t-shirt with a light jacket or cardigan, especially if you're going to be out in the evening.\n\n- **Miami**: It's hot at 30°C! Make sure to wear light, breathable clothing, and don't forget sunscreen and a hat to protect yourself from the sun.\n\n- **Boston**: It's quite chilly at 10°C. Please wear warm clothes, like a sweater or a jacket, and consider a scarf and gloves if you'll be outside for a while.",
          usage: {
            promptTokens: 523,
            completionTokens: 115,
            totalTokens: 638,
          },
          toolCalls: [],
          chainCompleted: true,
        },
        messages: [
          {
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: "- **Barcelona**: It's 24°C, so I recommend wearing light layers, like a t-shirt with a light jacket or cardigan, especially if you're going to be out in the evening.\n\n- **Miami**: It's hot at 30°C! Make sure to wear light, breathable clothing, and don't forget sunscreen and a hat to protect yourself from the sun.\n\n- **Boston**: It's quite chilly at 10°C. Please wear warm clothes, like a sweater or a jacket, and consider a scarf and gloves if you'll be outside for a while.",
              },
            ],
            toolCalls: [],
          },
        ],
        finishReason: 'stop',
        uuid: TOOLS_DOCUMENT_UUID,
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
