import { ContentType, Latitude, MessageRole } from '@latitude-data/sdk'
import { Pinecone } from '@pinecone-database/pinecone'
import OpenAI from 'openai'

const sdk = new Latitude(process.env.LATITUDE_API_KEY, {
  projectId: 1,
})
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY })
const pc = pinecone.Index('your-index-name')

const ragQueryTool = async (query: string) => {
  const embedding = await openai.embeddings
    .create({
      input: query,
      model: 'text-embedding-3-small',
    })
    .then((res) => res.data[0].embedding)

  const queryResponse = await pc.query({
    vector: embedding,
    topK: 10,
    includeMetadata: true,
  })

  return queryResponse.matches.map((match) => ({
    title: match.metadata?.title,
    content: match.metadata?.content,
  }))
}

const result = await sdk.run('geography-quizz', {
  projectId: 1,
})

const uuid = result.uuid
const conversation = result.conversation

const last = conversation[conversation.length - 1]!
if (last.role === MessageRole.assistant && last.toolCalls.length > 0) {
  const tool = last.toolCalls[0]! // we assume a single tool call for this example
  const { query } = tool.arguments
  const result = await ragQueryTool(query as string)

  sdk.chat(uuid, [
    {
      role: MessageRole.tool,
      content: [
        {
          type: ContentType.toolResult,
          toolCallId: tool.id,
          toolName: tool.name,
          result,
          isError: false,
        },
      ],
    },
  ])
}
