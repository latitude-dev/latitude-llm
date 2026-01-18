import { eq } from 'drizzle-orm'

import { ForbiddenError } from '@latitude-data/constants/errors'
import { IntegrationDto } from '../../schema/models/types/Integration'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { integrations } from '../../schema/models/integrations'
import { destroyPipedreamAccountFromIntegration } from './pipedream/destroy'
import { listIntegrationReferences } from './references'

export async function destroyIntegration(
  integration: IntegrationDto,
  transaction = new Transaction(),
) {
  return transaction.call(async (trx) => {
    const referencesResult = await listIntegrationReferences(integration, trx)

    if (!Result.isOk(referencesResult)) {
      return referencesResult
    }

    const references = referencesResult.unwrap()
    if (references.length > 0) {
      const distinctDocumentUuids = new Set(
        references.map((r) => r.documentUuid),
      )
      return Result.error(
        new ForbiddenError(
          `Cannot delete integration ${integration.name} because it is being used by ${distinctDocumentUuids.size} prompts`,
        ),
      )
    }

    // Remove user's account from Pipedream
    await destroyPipedreamAccountFromIntegration(integration).then((r) =>
      r.unwrap(),
    )

    await trx.delete(integrations).where(eq(integrations.id, integration.id))
    return Result.ok(integration)
  })
}
