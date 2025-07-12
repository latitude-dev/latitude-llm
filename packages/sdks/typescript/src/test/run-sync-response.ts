export const RUN_TEXT_RESPONSE = {
  uuid: 'a8f2e5d8-4c72-48c7-a6e0-23df3f1cbe2a', // Random
  conversation: [],
  response: {
    streamType: 'text' as const,
    text: 'some-text',
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    toolCalls: [],
  },
  trace: {
    traceparent: '00-12345678901234567890123456789012-1234567890123456-01',
  },
}
