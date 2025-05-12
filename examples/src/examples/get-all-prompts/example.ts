import { Latitude } from '@latitude-data/sdk'
import { getLocalGateway } from '@/utils/javascript'

async function run() {
  const sdk = new Latitude(process.env.LATITUDE_API_KEY, {
    projectId: Number(process.env.PROJECT_ID),
    versionUuid: 'live',

    // Uncomment this to use a local gateway
    // __internal: { gateway: getLocalGateway() },
  })

  const response = await sdk.prompts.getAll()

  console.log(
    'Prompts: ',
    response.map((p) => p.path),
  )
}

run()
