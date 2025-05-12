import { Latitude, LatitudeApiError } from '@latitude-data/sdk'
import { getSDKDefaultOptions } from '../../utils/javascript'

async function runPrompt() {
  const { apiKey, options } = getSDKDefaultOptions({
    // Configure RUN_PROMPT_PROJECT_ID in examples/.env file
    projectId: +process.env.RUN_PROMPT_PROJECT_ID,
    versionUuid: 'live',
  })
  const sdk = new Latitude(apiKey, options)

  try {
    const response = await sdk.prompts.run('run-prompt', {
      parameters: { name: 'paco' },
      onError: (error) => {
        if (error) {
          console.error('Error:', error)
        }
      },
      stream: true,
    })

    console.log('API RESPONSE', response)
  } catch (error) {
    if (error instanceof LatitudeApiError) {
      console.error('API ERROR', error)
    }
  }
}

runPrompt()
