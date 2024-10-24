import { Latitude } from '@latitude-data/sdk'

async function makeSdkRequest() {
  const apiKey = process.env.LATITUDE_API_KEY

  if (!apiKey) {
    throw new Error('Latitude API key is required')
  }

  const sdk = new Latitude(apiKey, {})
  const response = await sdk.run('eval-food', {
    projectId: 1,
    parameters: { food: 'pizza' },
    versionUuid: '08c60d53-2701-4349-9e98-f811e4ffd8ab',
    onEvent: (event) => {
      console.log('CHUNK', event)
    },
    /* onFinished: (data) => { */
    /*   console.log('FINISHED', data) */
    /* }, */
    onError: (error) => {
      console.log('ERROR', error)
    },
  })

  console.log('RESPONSES', response)
}

makeSdkRequest()
