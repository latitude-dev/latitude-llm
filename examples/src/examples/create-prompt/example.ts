import { Latitude } from '@latitude-data/sdk'

const PROMPT = `
Answer succinctly yet complete.
<user>
  Tell me a joke about a {{topic}}
</user>
`
async function run() {
  const sdk = new Latitude(process.env.LATITUDE_API_KEY, {
    projectId: Number(process.env.PROJECT_ID),
    // YOU CAN NOT CREATE A PROMPT IN A LIVE Version
    // versionUuid='live',
    // More info: https://docs.latitude.so/guides/prompt-manager/version-control
    versionUuid: '[CREATE_A_NEW_VERSION_UUID]',
  })

  const response = await sdk.prompts.getOrCreate('create-prompt/example', {
    prompt: PROMPT,
  })
  console.log('Response', response)
}

run()
