import { eq } from 'drizzle-orm'
import { ProviderApiKey } from '../../browser'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { providerApiKeys } from '../../schema'
import { validateProviderApiKeyName } from './helpers/validateName'

export async function updateProviderApiKeyName(
  {
    providerApiKey,
    workspaceId,
    name,
  }: {
    providerApiKey: ProviderApiKey
    workspaceId: number
    name: string
  },
  transaction = new Transaction(),
) {
  return transaction.call<ProviderApiKey>(async (tx) => {
    const validatedNameResult = await validateProviderApiKeyName(
      {
        name,
        workspaceId,
      },
      tx,
    )

    if (!Result.isOk(validatedNameResult)) {
      return validatedNameResult
    }

    const validatedName = validatedNameResult.unwrap()

    const result = await tx
      .update(providerApiKeys)
      .set({ name: validatedName })
      .where(eq(providerApiKeys.id, providerApiKey.id))
      .returning()

    return Result.ok(result[0]!)
  })
}
