import { Latitude } from '@latitude-data/sdk'

async function run() {
  const sdk = new Latitude(process.env.LATITUDE_API_KEY, {
    projectId: Number(process.env.PROJECT_ID),
    versionUuid: 'live',
  })

  const response = await sdk.prompts.get('get-prompt/example')
  console.log('Prompt: ', response)
}

run()
