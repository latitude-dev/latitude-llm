import env from '$/env'

export async function GET() {
  // NOTE: This is so the health check fails if the env is not correctly loaded
  console.log(env)

  return Response.json({ status: 'ok' })
}
