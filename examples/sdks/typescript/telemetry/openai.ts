import { Latitude } from '@latitude-data/sdk'
import OpenAI from 'openai'

import { LLMClient, runSequentialRequests } from './shared'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const sdk = new Latitude(process.env.LATITUDE_API_KEY, {
  projectId: 6,
})

sdk.instrument({
  disableBatch: true,
  instrumentModules: {
    openAI: OpenAI,
  },
})

class OpenAIClient implements LLMClient {
  async makeCompletion(message: string): Promise<void> {
    await openai.chat.completions.create({
      temperature: 0.7,
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: message },
      ],
      model: 'gpt-4-turbo-preview',
    })
  }
}

// Start the sequence
runSequentialRequests(new OpenAIClient()).catch(console.error)
