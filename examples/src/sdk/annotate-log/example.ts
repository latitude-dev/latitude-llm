import { Latitude, Adapters } from '@latitude-data/sdk'
import OpenAI from 'openai'

// To run this example you need to create a evaluation on the prompt: `annontate-log/example`
// Info: https://docs.latitude.so/guides/evaluations/overview
const EVALUATION_UUID = 'YOUR_EVALUATION_UUID'

async function run() {
  const sdk = new Latitude(process.env.LATITUDE_API_KEY, {
    projectId: Number(process.env.PROJECT_ID),
    versionUuid: 'live',
  })
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  // Get the prompt from Latitude
  const prompt = await sdk.prompts.get('annotate-log/example')

  // Generate messages from the Latitude prompt
  // These messages are valid OpenAI messages. Note that we passed the Adapters.openai
  const { config, messages } = await sdk.prompts.render({
    prompt: { content: prompt.content },
    parameters: {},
    adapter: Adapters.openai,
  })

  // Call OpenAI
  const llmResponse = await openai.chat.completions.create({
    // @ts-ignore
    messages,
    model: config.model as string,
  })

  const { uuid } = await sdk.logs.create('annotate-log/example', messages, {
    response: llmResponse.choices[0].message.content,
  })

  // Score from 1 to 5 because the evaluation we created is of type `
  // More info: https://docs.latitude.so/guides/evaluations/humans-in-the-loop
  const result = await sdk.evaluations.annotate(uuid, 5, EVALUATION_UUID, {
    reason: 'This is a good joke!',
  })

  console.log('Result:', JSON.stringify(result, null, 2))
}

run()
