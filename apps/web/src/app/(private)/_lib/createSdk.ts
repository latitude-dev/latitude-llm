import { NotFoundError } from '@latitude-data/constants/errors'
import { compactObject } from '@latitude-data/core/lib/compactObject'
import { Result } from '@latitude-data/core/lib/Result'
import { findFirstApiKey } from '@latitude-data/core/queries/apiKeys/findFirst'
import { env } from '@latitude-data/env'
import { Latitude } from '@latitude-data/sdk'
import { LogSources } from '@latitude-data/core/constants'

import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
// NOTE: this would be a great candidate for a cache function with redis
async function getLatitudeApiKey(workspace: Workspace) {
  const firstApiKey = await findFirstApiKey({ workspaceId: workspace.id })

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
    if (result.error) return result

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
