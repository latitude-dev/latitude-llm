const documentTag = {
  name: 'Documents',
  description: 'Document operations',
  externalDocs: {
    description: 'Handle documents/prompts in Latitude',
    url: 'https://docs.latitude.so/guides/getting-started/concepts#prompts',
  },
}

const conversationTag = {
  name: 'Conversations',
  description: 'Conversations operations',
  externalDocs: {
    description: 'Handle conversations in Latitude',
    url: 'https://docs.latitude.so',
  },
}

const telemetryTag = {
  name: 'Telemetry',
  description: 'Latitude telemetry tracing operations',
  externalDocs: {
    description: 'Tracing your LLM calls',
    url: 'https://docs.latitude.so/guides/sdk/typescript#tracing-your-llm-calls',
  },
}

const v1Deprecated = {
  name: 'V1_DEPRECATED',
  description: 'V1 of the API is deprecated. Please use V2',
}

export const tags = [documentTag, conversationTag, telemetryTag, v1Deprecated]
