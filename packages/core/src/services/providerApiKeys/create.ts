import { Providers, Workspace } from '$core/browser'
import { database } from '$core/client'
import { Result, Transaction } from '$core/lib'
import { providerApiKeys } from '$core/schema'

export function createProviderApiKey(
  {
    workspace,
    provider,
    token,
    name,
    authorId,
  }: {
    workspace: Partial<Workspace>
    provider: Providers
    token: string
    name: string
    authorId: string
  },
  db = database,
) {
  return Transaction.call(async (tx) => {
    const result = await tx
      .insert(providerApiKeys)
      .values({
        workspaceId: workspace.id!,
        provider,
        token,
        name,
        authorId,
      })
      .returning()

    return Result.ok(result[0]!)
  }, db)
}
