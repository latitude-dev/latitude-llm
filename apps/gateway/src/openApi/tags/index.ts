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

const projectsTag = {
  name: 'Projects',
  description: 'Project operations',
  externalDocs: {
    description: 'Handle projects in Latitude',
    url: 'https://docs.latitude.so',
  },
}

const v1Deprecated = {
  name: 'V1_DEPRECATED',
  description: 'V1 of the API is deprecated. Please use V2',
}

export const tags = [documentTag, conversationTag, projectsTag, v1Deprecated]
