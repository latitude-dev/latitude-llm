import { compactObject } from '@latitude-data/core/lib/compactObject'
import { NotFoundError } from '@latitude-data/core/lib/errors'
import { Result } from '@latitude-data/core/lib/Result'
import { LatitudeApiKeysRepository } from '@latitude-data/core/repositories'
import { Latitude } from '@latitude-data/sdk'
import env from '$/env'
import { getCurrentUser } from '$/services/auth/getCurrentUser'

// NOTE: this would be a great candidate for a cache function with redis
async function getLatitudeApiKey() {
  const { workspace } = await getCurrentUser()
  const repo = new LatitudeApiKeysRepository(workspace.id)
  const firstApiKey = await repo.findFirst().then((r) => r.unwrap())

  if (!firstApiKey) {
    return Result.error(
      new NotFoundError("Couldn't find a valid Latitude API key"),
    )
  }

  return Result.ok(firstApiKey)
}

export async function createSdk({
  projectId,
  apiKey,
}: {
  projectId?: number
  apiKey?: string
} = {}) {
  if (!apiKey) {
    const result = await getLatitudeApiKey()
    if (result.error) return result

    apiKey = result.value.token
  }

  const gateway = {
    host: env.GATEWAY_HOSTNAME,
    port: env.GATEWAY_PORT,
    ssl: env.GATEWAY_SSL,
  }
  return Result.ok(new Latitude(apiKey, compactObject({ gateway, projectId })))
}
