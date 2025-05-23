import { Latitude } from '@latitude-data/sdk'
import { getLocalGateway } from '@/utils/javascript'

// You can type the tools you are using
type Tools = { get_weather: { location: string } }

async function run() {
  const sdk = new Latitude(process.env.LATITUDE_API_KEY, {
    projectId: Number(process.env.PROJECT_ID),
    versionUuid: 'live',

    // Uncomment this to use a local gateway
    // __internal: { gateway: getLocalGateway() },
  })

  const response = await sdk.prompts.run<Tools>(
    'run-prompt-with-tools/example',
    {
      parameters: { location: 'Boston' },
      tools: {
        get_weather: async ({ location }, { pauseExecution: _pe }) => {
          // const callPauseExecution = process.env.PAUSE_EXECUTION

          // if (callPauseExecution) {
          //   return pauseExecution()
          // }
          return { temperature: `2°C for ${location}` }
        },
      },
    },
  )

  console.log('RESPONSE', JSON.stringify(response, null, 2))
}

run()
