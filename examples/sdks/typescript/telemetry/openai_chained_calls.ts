import Anthropic from '@anthropic-ai/sdk'
import { Latitude } from '@latitude-data/sdk'
import OpenAI from 'openai'

const sdk = new Latitude(process.env.LATITUDE_API_KEY, {
  projectId: 6,
})

sdk.instrument({
  disableBatch: true,
  instrumentModules: {
    openAI: OpenAI,
    // @ts-expect-error
    anthropic: Anthropic,
  },
})

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

async function chainedJokes() {
  try {
    // First call - ask for an initial joke
    const firstResponse = await openai.chat.completions.create({
      temperature: 0.7,
      messages: [
        { role: 'system', content: 'You are a funny comedian.' },
        { role: 'user', content: 'Tell me a short, family-friendly joke.' },
      ],
      model: 'gpt-4o-mini',
    })

    const firstJoke = firstResponse.choices[0].message.content

    console.log('First joke:', firstJoke)

    // Second call - use the first joke to ask for a related joke
    const secondResponse = await sdk.workflow(
      { name: 'second-openai-call' },
      async () => {
        return await openai.chat.completions.create({
          temperature: 0.7,
          messages: [
            { role: 'system', content: 'You are a funny comedian.' },
            { role: 'assistant', content: firstJoke },
            {
              role: 'user',
              content:
                "That was funny! Now tell me another joke that's somehow related to the theme of your first joke.",
            },
          ],
          model: 'gpt-4o',
        })
      },
    )

    const secondJoke = secondResponse.choices[0].message.content
    sdk.workflow({ name: 'anthropic-evaluates' }, async () => {
      const anthropicResponse = await anthropic.messages.create({
        messages: [
          { role: 'user', content: 'You are a funny comedian.' },
          { role: 'assistant', content: firstJoke },
          {
            role: 'user',
            content:
              "That was funny! Now tell me another joke that's somehow related to the theme of your first joke.",
          },
          {
            role: 'assistant',
            content: secondJoke,
          },
          {
            role: 'user',
            content:
              'Evaluate the jokes made by the assistant and give a score from 0 to 100 in terms of how funny they are.',
          },
        ],
        model: 'claude-3-5-sonnet-latest',
        max_tokens: 1024,
      })

      console.log('Anthropic evaluation:', anthropicResponse)
    })
  } catch (error) {
    console.error('Error:', error)
  }
}

const { path } = await sdk.prompts.getOrCreate('foo')
const { uuid: evaluationUuid } = await sdk.evaluations.getOrCreate({
  name: 'openai-chained-calls',
  description: 'Evaluate the jokes made by the assistant',
  promptPath: path,
  resultConfiguration: {
    type: 'number',
    minValue: 1,
    maxValue: 5,
  },
  metadata: {
    type: 'llm_as_judge_simple',
    objective: 'Evaluate the jokes made by the assistant',
    additionalInstructions:
      'Give a score from 0 to 100 in terms of how funny they are.',
  },
})

await chainedJokes()
