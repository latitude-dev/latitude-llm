
import { Latitude } from '@latitude-data/sdk'



async function makeSdkRequest() {
  const apiKey = process.env.LATITUDE_API_KEY
  const projectId = process.env.LATITUDE_PROJECT_ID
  if (!apiKey) {
    throw new Error('Latitude API key is required')
  }

  console.log("API_KEY", apiKey)

  const sdk = new Latitude(apiKey)
  const response = await sdk.run('run-document', {

  })
}

makeSdkRequest()
