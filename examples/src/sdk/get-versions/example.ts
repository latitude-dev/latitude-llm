import { Latitude } from '@latitude-data/sdk'

async function run() {
  const sdk = new Latitude(process.env.LATITUDE_API_KEY, {
    projectId: Number(process.env.PROJECT_ID),
    versionUuid: 'live',
  })

  const response = await sdk.versions.getAll()

  // You can also pass a specific projectId other than the one
  // you are using in the sdk
  // const response = await sdk.versions.getAll(123)

  console.log(
    'Versions: ',
    response.map((v) => ({
      uuid: v.uuid,
      title: v.title,
      createdAt: v.createdAt,
    })),
  )
}

run()
