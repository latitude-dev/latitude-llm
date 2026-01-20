import { Latitude } from '@latitude-data/sdk'

async function run() {
  const sdk = new Latitude(process.env.LATITUDE_API_KEY, {
    projectId: Number(process.env.PROJECT_ID),
    versionUuid: 'live',
    __internal: {
      gateway: {
        host: 'localhost',
        port: 8787,
        ssl: false,
      }
    },
  })

  const result = await sdk.prompts.run('drink_water_bug', {
    // Get messages as streaming
    stream: false,
    background: true,

    // To get streaming you can use `onEvent`
    onEvent: (event) => {
      console.log('Event:', event)
    },
    onError: (error) => {
      if (!error) return

      console.error('Error:', error)
    },
  })

  console.log('Result:', result)
}

run()
