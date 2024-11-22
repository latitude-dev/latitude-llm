import { openai } from '@ai-sdk/openai'
import { Latitude } from '@latitude-data/sdk'
import { generateText } from 'ai'
import OpenAI from 'openai'

const sdk = new Latitude(process.env.LATITUDE_API_KEY, {
  projectId: 6,
})

sdk.instrument({
  disableBatch: true,
  instrumentModules: {
    openAI: OpenAI,
  },
})

async function chainedJokesWithVercel() {
  try {
    // Convert the response to a readable stream
    const response = await generateText({
      messages: [
        { role: 'system', content: 'You are a funny comedian.' },
        { role: 'user', content: 'Tell me a short, family-friendly joke.' },
      ],
      model: openai('gpt-4o-mini'),
    })

    console.log('First joke:', response.text)

    sdk.task({ name: 'related-joke' }, async () => {
      // Second call - use the first joke to ask for a related joke
      const secondResponse = await generateText({
        messages: [
          { role: 'system', content: 'You are a funny comedian.' },
          { role: 'assistant', content: response.text },
          {
            role: 'user',
            content:
              "That was funny! Now tell me another joke that's somehow related to the theme of your first joke.",
          },
        ],
        model: openai('gpt-4o'),
      })

      console.log('Second joke:', secondResponse.text)
    })
  } catch (error) {
    console.error('Error:', error)
  }
}

// Run the chained jokes
sdk.workflow({ name: 'chained-jokes-vercel' }, async () => {
  await chainedJokesWithVercel()
})
