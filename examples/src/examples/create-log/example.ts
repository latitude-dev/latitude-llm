import { Latitude } from '@latitude-data/sdk'
import { MessageRole, ContentType } from 'promptl-ai'

async function run() {
  const sdk = new Latitude(process.env.LATITUDE_API_KEY, {
    projectId: Number(process.env.PROJECT_ID),
    versionUuid: 'live',
  })

  const response = await sdk.logs.create(
    'create-log/example',
    [
      {
        role: MessageRole.user,
        content: [
          { type: ContentType.text, text: 'Tell me a joke about Python' },
        ],
      },
      {
        role: MessageRole.assistant,
        content: [
          { type: ContentType.text, text: 'Python is a great language!' },
        ],
      },
      {
        role: MessageRole.user,
        content: [
          { type: ContentType.text, text: 'Tell me a joke about javascript!' },
        ],
      },
    ],
    {
      response: 'Javascript is a great language!',
    },
  )

  console.log('Log: ', response)
}

run()
