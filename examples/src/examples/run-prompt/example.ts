import { Latitude, LatitudeApiError } from '@latitude-data/sdk'
import { getLocalGateway } from '@/utils/javascript'

async function run() {
  const sdk = new Latitude(process.env.LATITUDE_API_KEY, {
    projectId: Number(process.env.PROJECT_ID),
    versionUuid: 'live',

    // Uncomment this to use a local gateway
    /* __internal: { gateway: getLocalGateway() }, */
  })

  const result = await sdk.prompts.run('run-prompt/example', {
    parameters: {
      product_name: 'iPhone',
      features: 'Camera, Battery, Display',
      target_audience: 'Tech enthusiasts',
      tone: 'Informal',
      word_count: 20,
    },
    // Get messages as streaming
    stream: true,

    // To get streaming you can use `onEvent`
    /* onEvent: (event) => { */
    /*   console.log('Event:', event) */
    /* }, */
    onError: (error) => {
      if (!error) return

      console.error('Error:', error)
    },
  })

  console.log('Result:', result)
}

run()
