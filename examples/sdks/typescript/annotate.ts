import { ContentType, Latitude, MessageRole } from '@latitude-data/sdk'
import OpenAI from 'openai'

const sdk = new Latitude('626ec0c7-9473-4897-b405-f9a07b737e1e', {
  projectId: 9,
  versionUuid: '3f7c3aa1-433a-4494-837e-d14ba276dc46',
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

const { uuid } = await sdk.logs.create('joker', messages, {
  response: chatCompletion.choices[0].message.content,
})

const evaluationUuid = 'd1be55cb-b953-4c81-a8b9-72255c47bf1f'
await sdk.evaluations.annotate(uuid, 100, evaluationUuid, {
  reason: 'This is a good joke!',
})
