import { Latitude } from '@latitude-data/sdk'

async function run() {
  console.log('Node.js version:', process.version)

  const sdk = new Latitude(process.env.LATITUDE_API_KEY, {
    projectId: Number(process.env.PROJECT_ID),
    /* versionUuid: 'live', */
    versionUuid: 'edc47930-0108-4236-92d9-151c9e282f64',
    __internal: {
      gateway: {
        host: 'localhost',
        port: 8443,
        ssl: true,
      }
    },
  })

  const result = await sdk.prompts.run('poem-generator', {
    stream: false,
    background: false,
    parameters: {
      theme: 'Story about a brave knight',
    },

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
