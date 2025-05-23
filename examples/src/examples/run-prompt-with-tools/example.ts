import { Latitude } from '@latitude-data/sdk'

// You can type the tools you are using
type Tools = { get_weather: { location: string } }

async function run() {
  const sdk = new Latitude(process.env.LATITUDE_API_KEY, {
    projectId: Number(process.env.PROJECT_ID),
    versionUuid: 'live',
  })

  const response = await sdk.prompts.run<Tools>(
    'run-prompt-with-tools/example',
    {
      parameters: { location: 'Boston' },
      tools: {
        get_weather: async ({ location }) => {
          return { temperature: `2°C for ${location}` }
        },
      },
    },
  )

  console.log('RESPONSE', JSON.stringify(response, null, 2))
}

run()
