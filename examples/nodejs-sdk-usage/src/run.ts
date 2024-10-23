import { Latitude, LatitudeApiError } from '@latitude-data/sdk'

/**
 * This is a playground to run our JS SDK
 * Is fine to have commented code commited. But please
 * DO NOT PUT ANY SENSITIVE INFORMATION HERE
 */
async function makeSdkRequest() {
  const apiKey = process.env.LATITUDE_API_KEY

  if (!apiKey) {
    throw new Error('Latitude API key is required')
  }

  const sdk = new Latitude(apiKey, {
    gateway: {
      host: 'localhost',
      port: 8787,
      ssl: false,
    },
  })

  try {
    const response = await sdk.run('file-test', {
      projectId: 1,
      parameters: { username: 'paco24', name: 'Mario' },
      versionUuid: '08c60d53-2701-4349-9e98-f811e4ffd8ab',
      stream: false,
      onError: (error) => {
        console.log('oError ERROR.errorCode', error.errorCode)
        console.log('oError ERROR.message', error.message)
        console.log('oError ERROR.dbErrorRef', error.dbErrorRef)
      },
    })
    console.log('RESPONSE', response)
  } catch (error: unknown) {
    if (error instanceof LatitudeApiError) {
      console.log('API ERROR.errorCode', error.errorCode)
      console.log('API ERROR.message', error.message)
      console.log('API ERROR.dbErrorRef', error.dbErrorRef)
    }
  }
}

makeSdkRequest()
