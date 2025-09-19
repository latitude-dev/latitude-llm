import { NotFoundError } from '@latitude-data/constants/errors'
import { LogSources, Workspace } from '@latitude-data/core/browser'
import { compactObject } from '@latitude-data/core/lib/compactObject'
import { Result } from '@latitude-data/core/lib/Result'
import { LatitudeApiKeysRepository } from '@latitude-data/core/repositories'
import { env } from '@latitude-data/env'
import { Latitude } from '@latitude-data/sdk'

// NOTE: this would be a great candidate for a cache function with redis
async function getLatitudeApiKey(workspace: Workspace) {
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
  workspace,
  projectId,
  apiKey,
  __internal,
}: {
  workspace: Workspace
  projectId?: number
  apiKey?: string
  __internal?: { source: LogSources }
}) {
  if (!apiKey) {
    const result = await getLatitudeApiKey(workspace)
    if (!Result.isOk(result)) return result

    apiKey = result.value.token
  }

  const gateway = {
    host: env.GATEWAY_HOSTNAME,
    port: env.GATEWAY_PORT,
    ssl: env.GATEWAY_SSL,
  }

  return Result.ok(
    new Latitude(
      apiKey,
      compactObject({
        gateway,
        projectId,
        __internal: {
          ...__internal,
          gateway,
        },
      }),
    ),
  )
}
