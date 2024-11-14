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
const { uuid } = await sdk.logs.create('joker', messages, {
  response: chatCompletion.choices[0].message.content,
})

// Push the evaluation result to the evaluation with the UUID 'evaluationUuid'
const evaluationUuid = '53975dcb-2a86-4ea1-ab53-b54587e01231'
await sdk.evaluations.createResult(uuid, evaluationUuid, {
  result: 5,
  reason: 'This is a good joke',
})
