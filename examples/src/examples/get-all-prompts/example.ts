import { Latitude } from '@latitude-data/sdk'

async function run() {
  const sdk = new Latitude(process.env.LATITUDE_API_KEY, {
    projectId: Number(process.env.PROJECT_ID),
    versionUuid: 'live',
  })

  const response = await sdk.prompts.getAll()

  // You can also pass a specific projectId and versionUuid other
  // than the one you are using in the sdk
  // const response = await sdk.prompts.getAll({
  //   projectId: 123,
  //  versionUuid: 'some-version-uuid',
  // })

  console.log(
    'Prompts: ',
    response.map((p) => p.path),
  )
}

run()
