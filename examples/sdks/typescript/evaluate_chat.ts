import { ContentType, Latitude, MessageRole } from '@latitude-data/sdk'

// Initialize SDK
const sdk = new Latitude(process.env.LATITUDE_API_KEY, {
  projectId: 1,
})

const { uuid } = await sdk.prompts.run('joker', {
  parameters: {
    topic: 'firefighters',
  },
})

// 2. Chat with the model
await sdk.prompts.chat(uuid, [
  {
    role: 'user' as MessageRole.user,
    content: [
      {
        type: 'text' as ContentType.text,
        text: 'Tell me another joke about doctors',
      },
    ],
  },
])

// 3. Evaluate the full conversation
await sdk.evaluations.trigger(uuid)
