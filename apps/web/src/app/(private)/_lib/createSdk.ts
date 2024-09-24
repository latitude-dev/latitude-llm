import { compactObject } from '@latitude-data/core/lib/compactObject'
import { Result } from '@latitude-data/core/lib/Result'
import { LatitudeApiKeysRepository } from '@latitude-data/core/repositories'
import { LatitudeSdk } from '@latitude-data/sdk-js'
import env from '$/env'
import { getCurrentUser } from '$/services/auth/getCurrentUser'

// NOTE: this would be a great candidate for a cache function with redis
async function getLatitudeApiKey() {
  const { workspace } = await getCurrentUser()
  const repo = new LatitudeApiKeysRepository(workspace.id)
  const result = await repo.findFirst()

  if (result.error) return result

  return Result.ok(result.value)
}

export async function createSdk(projectId?: number) {
  const result = await getLatitudeApiKey()
  if (result.error) return result

  const latitudeApiKey = result.value.token

  const gateway = {
    host: env.GATEWAY_HOSTNAME,
    port: env.GATEWAY_PORT,
    ssl: env.GATEWAY_SSL,
  }
  return Result.ok(
    new LatitudeSdk(latitudeApiKey, compactObject({ gateway, projectId })),
  )
}
