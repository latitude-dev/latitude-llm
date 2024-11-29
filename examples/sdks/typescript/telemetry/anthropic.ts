import Anthropic from '@anthropic-ai/sdk'
import { Latitude } from '@latitude-data/sdk'

import { LLMClient, runSequentialRequests } from './shared'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const sdk = new Latitude(process.env.LATITUDE_API_KEY, {
  projectId: 6,
})

sdk.instrument({
  disableBatch: true,
  instrumentModules: {
    // @ts-expect-error
    anthropic: Anthropic,
  },
})

class AnthropicClient implements LLMClient {
  async makeCompletion(message: string): Promise<void> {
    await anthropic.messages.create({
      system: 'You are a helpful assistant that makes great jokes.',
      messages: [
        { role: 'user', content: 'I will ask you for a joke ok?' },
        { role: 'user', content: message },
      ],
      model: 'claude-3-5-sonnet-latest',
      max_tokens: 1024,
    })
  }
}

// Start the sequence
runSequentialRequests(new AnthropicClient()).catch(console.error)
