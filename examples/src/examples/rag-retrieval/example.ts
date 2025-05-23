import { Pinecone } from '@pinecone-database/pinecone'
import OpenAI from 'openai'
import { Latitude } from '@latitude-data/sdk'

type Tools = { get_answer: { question: string } }

const PINECODE_INDEX_NAME = 'geography-quizz-index'

async function run() {
  const sdk = new Latitude(process.env.LATITUDE_API_KEY, {
    projectId: Number(process.env.PROJECT_ID),
    versionUuid: 'live',

    // Uncomment this to use a local gateway
    // __internal: { gateway: getLocalGateway() },
  })
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY })
  const pc = pinecone.Index(PINECODE_INDEX_NAME)

  const question = 'What is the deepest ocean in the world?'

  console.log('Question: ', question)
  console.log('\nSearching...\n')

  const result = await sdk.prompts.run<Tools>('rag-retrieval/example', {
    parameters: { question },
    tools: {
      get_answer: async ({ question }) => {
        const embedding = await openai.embeddings
          .create({
            input: question,
            model: 'text-embedding-3-small',
          })
          .then((res) => res.data[0].embedding)

        const queryResponse = await pc.query({
          vector: embedding,
          topK: 10,
          includeMetadata: true,
        })

        const first = queryResponse.matches[0]
        return first?.metadata?.answer
      },
    },
  })

  console.log('Answer: ', result.response.text)
}

run()
