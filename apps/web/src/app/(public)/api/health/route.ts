import '@latitude-data/env'

import '$/envClient'

export async function GET() {
  return Response.json({ status: 'ok' })
}
