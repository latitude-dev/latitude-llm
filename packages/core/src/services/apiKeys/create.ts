import type { Workspace } from '../../schema/models/types/Workspace'
import { BadRequestError } from '../../lib/errors'
import { generateUUIDIdentifier } from '../../lib/generateUUID'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { apiKeys } from '../../schema/models/apiKeys'

export const MAX_API_KEY_NAME_LENGTH = 256

export async function createApiKey(
  { name, workspace }: { name?: string; workspace: Workspace },
  transaction = new Transaction(),
) {
  if (name && name.length > MAX_API_KEY_NAME_LENGTH) {
    return Result.error(
      new BadRequestError(
        `API key name must be ${MAX_API_KEY_NAME_LENGTH} characters or less`,
      ),
    )
  }

  return transaction.call(async (tx) => {
    const token = generateUUIDIdentifier()
    const result = await tx
      .insert(apiKeys)
      .values({ workspaceId: workspace.id, name, token })
      .returning()

    return Result.ok(result[0]!)
  })
}
