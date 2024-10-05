import { Providers, User, Workspace } from '../../browser'
import { database } from '../../client'
import { publisher } from '../../events/publisher'
import { BadRequestError, Result, Transaction } from '../../lib'
import { providerApiKeys } from '../../schema'

export type Props = {
  workspace: Workspace
  provider: Providers
  token: string
  url?: string
  name: string
  author: User
}
export function createProviderApiKey(
  { workspace, provider, token, url, name, author }: Props,
  db = database,
) {
  return Transaction.call(async (tx) => {
    if (provider === Providers.Custom && !url) {
      return Result.error(new BadRequestError('Custom provider requires a URL'))
    }

    const result = await tx
      .insert(providerApiKeys)
      .values({
        workspaceId: workspace.id!,
        provider,
        token,
        url,
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
