import { Latitude, LatitudeApiError } from '@latitude-data/sdk'

const { apiKey, projectId, commitUuid } = {
  apiKey: process.env.LATITUDE_API_KEY,
  projectId: +process.env.PROJECT_ID,
  commitUuid: process.env.COMMIT_UUID,
}

async function getAllDocuments() {
  const sdk = new Latitude(apiKey, {
    __internal: {
      gateway: {
        host: 'localhost',
        port: 8787,
        ssl: false,
      },
    },
  })
  try {
    const response = await sdk.prompts.getAll({
      projectId,
      versionUuid: commitUuid,
    })

    console.log('API RESPONSE', response)
  } catch (error) {
    if (error instanceof LatitudeApiError) {
      console.error('API ERROR', error)
    }
  }
}

getAllDocuments()
