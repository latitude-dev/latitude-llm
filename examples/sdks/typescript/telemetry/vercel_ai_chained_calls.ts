import { openai } from '@ai-sdk/openai'
import {
  isOpenInferenceSpan,
  OpenInferenceSimpleSpanProcessor,
} from '@arizeai/openinference-vercel'
import { Latitude } from '@latitude-data/sdk'
import { LatitudeExporter } from '@latitude-data/telemetry-js'
import { registerOTel } from '@vercel/otel'
import { generateText } from 'ai'

registerOTel({
  serviceName: 'ai-sdk-example',
  spanProcessors: [
    new OpenInferenceSimpleSpanProcessor({
      exporter: new LatitudeExporter({
        apiKey: process.env.LATITUDE_API_KEY,
        projectId: 6,
      }),
      spanFilter: (span) => isOpenInferenceSpan(span),
    }),
  ],
})

const sdk = new Latitude(process.env.LATITUDE_API_KEY, {
  projectId: 6,
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

chainedJokesWithVercel()
