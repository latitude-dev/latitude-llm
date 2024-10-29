import { Latitude, LatitudeApiError } from '@latitude-data/sdk'

async function makeDocumentRequest() {
  const sdk = new Latitude(process.env.LATITUDE_API_KEY, {
    gateway: {
      host: 'localhost',
      port: 8787,
      ssl: false,
    },
  })
  try {
    const response = await sdk.run('file-test', {
      projectId: 1,
      parameters: { username: 'mario82', name: 'Mario' },
      versionUuid: '08c60d53-2701-4349-9e98-f811e4ffd8ab',
      stream: false,
    })

    console.log('API RESPONSE', response)
  } catch (error) {
    if (error instanceof LatitudeApiError) {
      console.error('API ERROR', error)
    }
  }
}

makeDocumentRequest()
