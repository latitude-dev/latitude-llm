import { Latitude, LatitudeApiError } from '@latitude-data/sdk'

const { apiKey, projectId, commitUuid, documentPath } = {
  apiKey: process.env.LATITUDE_API_KEY,
  projectId: +process.env.PROJECT_ID,
  documentPath: process.env.DOCUMENT_PATH,
  commitUuid: process.env.COMMIT_UUID,
}

async function makeDocumentRequest() {
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
    const response = await sdk.prompts.run(documentPath, {
      projectId,
      parameters: { name: 'paco' },
      versionUuid: commitUuid,
      stream: true,
    })

    console.log('API RESPONSE', response)
  } catch (error) {
    if (error instanceof LatitudeApiError) {
      console.error('API ERROR', error)
    }
  }
}

makeDocumentRequest()
