import { Providers, User, Workspace } from '../../browser'
import { database } from '../../client'
import { publisher } from '../../events/publisher'
import { Result, Transaction } from '../../lib'
import { providerApiKeys } from '../../schema'

export type Props = {
  workspace: Workspace
  provider: Providers
  token: string
  name: string
  author: User
}
export function createProviderApiKey(
  { workspace, provider, token, name, author }: Props,
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
        authorId: author.id,
      })
      .returning()

    publisher.publishLater({
      type: 'providerApiKeyCreated',
      data: {
        providerApiKey: result[0]!,
        workspaceId: workspace.id,
        userEmail: author.email,
      },
    })

    return Result.ok(result[0]!)
  }, db)
}
