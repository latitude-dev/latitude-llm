import { Latitude } from '@latitude-data/sdk'

async function makeSdkRequest() {
  const apiKey = process.env.LATITUDE_API_KEY
  const projectId = process.env.LATITUDE_PROJECT_ID
  if (!apiKey) {
    throw new Error('Latitude API key is required')
  }

  console.log('API_KEY', apiKey)

  const sdk = new Latitude(apiKey, {
    gateway: {
      host: 'localhost',
      port: 8787,
      ssl: false,
    },
  })
  const response = await sdk.run('eval-food', {
    projectId: 1,
    versionUuid: '08c60d53-2701-4349-9e98-f811e4ffd8ab',
    onFinished: (data) => {
      console.log("FINISHED", data)
    }
  })

  console.log('RESPONSES', response)
}

makeSdkRequest()
