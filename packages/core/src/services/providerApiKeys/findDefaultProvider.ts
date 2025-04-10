import { env } from '@latitude-data/env'

import { Providers, Workspace } from '../../browser'
import { database, Database } from '../../client'
import { Result } from '../../lib/Result'
import { ProviderApiKeysRepository } from '../../repositories'

export async function findDefaultProvider(
  workspace: Workspace,
  db: Database = database,
) {
  const providerScope = new ProviderApiKeysRepository(workspace.id, db)

  if (workspace.defaultProviderId) {
    return Result.ok(
      await providerScope
        .find(workspace.defaultProviderId)
        .then((r) => r.unwrap()),
    )
  }

  return Result.ok(await providerScope.findFirst().then((r) => r.unwrap()))
}

export async function findDefaultEvaluationProvider(
  workspace: Workspace,
  db: Database = database,
) {
  const providerScope = new ProviderApiKeysRepository(workspace.id, db)
  let providers = await providerScope.findAll().then((r) => r.unwrap())

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
