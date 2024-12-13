import { openai } from '@ai-sdk/openai'
import { VercelSpanProcessor } from '@latitude-data/telemetry'
import { registerOTel } from '@vercel/otel'
import { generateText } from 'ai'
import { z } from 'zod'

registerOTel({
  serviceName: 'ai-sdk-example',
  spanProcessors: [
    // @ts-ignore
    new VercelSpanProcessor({
      apiKey: process.env.LATITUDE_API_KEY,
      projectId: 15,
    }),
  ],
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
      experimental_telemetry: {
        isEnabled: true,
      },
    })

    console.log('First joke:', response.text)

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
      experimental_telemetry: {
        isEnabled: true,
      },
    })

    console.log('Second joke:', secondResponse.text)
  } catch (error) {
    console.error('Error:', error)
  }
}

async function generateTextWithTool() {
  try {
    const response = await generateText({
      messages: [
        {
          role: 'system',
          content:
            'You are a helpful assistant that can get the current weather.',
        },
        {
          role: 'user',
          content: "What's the weather like in London right now?",
        },
      ],
      model: openai('gpt-4'),
      experimental_telemetry: {
        isEnabled: true,
      },
      tools: {
        getCurrentWeather: {
          description: 'Get the current weather in a given location',
          parameters: z.object({
            location: z
              .string()
              .describe('The city and state, e.g. San Francisco, CA'),
            unit: z
              .enum(['celsius', 'fahrenheit'])
              .optional()
              .describe('The unit of temperature to use'),
          }),
          execute: async (args) => {
            // Mock weather data
            return {
              temperature: 18,
              unit: 'celsius',
              condition: 'partly cloudy',
            }
          },
        },
      },
    })

    console.log('Response:', response.text)

    if (response.toolResults) {
      console.log('Tool results:', response.toolResults)
    }
  } catch (error) {
    console.error('Error:', error)
  }
}

chainedJokesWithVercel()
// generateTextWithTool()
