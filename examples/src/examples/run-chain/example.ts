import { Latitude, Adapters, Message } from '@latitude-data/sdk'
import { getLocalGateway } from '@/utils/javascript'
import OpenAI from 'openai'

async function run() {
  const sdk = new Latitude(process.env.LATITUDE_API_KEY, {
    projectId: Number(process.env.PROJECT_ID),
    versionUuid: 'live',

    // Uncomment this to use a local gateway
    // __internal: { gateway: getLocalGateway() },
  })
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const prompt = await sdk.prompts.get('run-chain/example')
  const result = await sdk.prompts.renderChain({
    prompt,
    parameters: { question: 'What is the meaning of life?' },
    adapter: Adapters.openai,
    onStep: async ({
      config,
      messages,
    }: {
      config: { [s: string]: unknown }
      messages: Message[]
    }) => {
      const response = await openai.chat.completions.create({
        model: config.model as string,
        temperature: config.temperature as number,
        messages,
      })

      return response.choices[0].message
    },
  })

  console.log('Result:', JSON.stringify(result, null, 2))
}

run()
