import { ContentType, Latitude, MessageRole } from '@latitude-data/sdk'
import OpenAI from 'openai'

const sdk = new Latitude(process.env.LATITUDE_API_KEY, {
  projectId: 1,
})
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const messages = [
  {
    role: 'user' as MessageRole.user,
    content: [
      {
        type: 'text' as ContentType.text,
        text: 'Please tell me a joke about doctors',
      },
    ],
  },
]
const chatCompletion = await openai.chat.completions.create({
  messages,
  model: 'gpt-4o-mini',
})

// Push the log to the live version of our prompt called 'joker'
sdk.logs.create('joker', messages, {
  response: chatCompletion.choices[0].message.content,
})
