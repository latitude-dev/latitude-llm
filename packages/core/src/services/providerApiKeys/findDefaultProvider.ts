import { env } from '@latitude-data/env'

import { Providers } from '@latitude-data/constants'
import { type Workspace } from '../../schema/models/types/Workspace'
import { database } from '../../client'
import { Result } from '../../lib/Result'
import { findProviderApiKeyById } from '../../queries/providerApiKeys/findById'
import { findAllProviderApiKeys } from '../../queries/providerApiKeys/findAll'
import { findFirstProviderApiKey } from '../../queries/providerApiKeys/findFirst'

export async function findDefaultProvider(workspace: Workspace, db = database) {
  if (workspace.defaultProviderId) {
    const provider = await findProviderApiKeyById(
      {
        workspaceId: workspace.id,
        id: workspace.defaultProviderId,
      },
      db,
    )
    return Result.ok(provider)
  }

  const provider = await findFirstProviderApiKey(
    { workspaceId: workspace.id },
    db,
  )
  return Result.ok(provider)
}

export async function findDefaultEvaluationProvider(
  workspace: Workspace,
  db = database,
) {
  let providers = await findAllProviderApiKeys(
    { workspaceId: workspace.id },
    db,
  )

  if (workspace.defaultProviderId) {
    providers = [
      providers.find((p) => p.id === workspace.defaultProviderId)!,
      ...providers.filter((p) => p.id !== workspace.defaultProviderId),
    ]
  }

  const found = providers.find((p) => {
    if (
      [Providers.OpenAI, Providers.Anthropic].includes(p.provider) &&
      p.token !== env.DEFAULT_PROVIDER_API_KEY
    ) {
      return true
    }

    return false
  })

  if (found) return Result.ok(found)

  return Result.ok(
    providers.find((p) => p.token === env.DEFAULT_PROVIDER_API_KEY),
  )
}
