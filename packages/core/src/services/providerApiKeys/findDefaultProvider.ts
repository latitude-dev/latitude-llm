import { env } from '@latitude-data/env'

import { Providers, Workspace } from '../../browser'
import { database, Database } from '../../client'
import { ProviderApiKeysRepository } from '../../repositories'

export async function findDefaultProvider(
  workspace: Workspace,
  db: Database = database,
) {
  const providerScope = new ProviderApiKeysRepository(workspace!.id, db)
  const providers = await providerScope.findAll().then((r) => r.unwrap())
  const found = providers.find((p) => {
    if (
      [Providers.OpenAI, Providers.Anthropic].includes(p.provider) &&
      p.token !== env.DEFAULT_PROVIDER_API_KEY
    ) {
      return true
    }

    return false
  })

  if (found) return found

  return providers.find((p) => p.token === env.DEFAULT_PROVIDER_API_KEY)
}
