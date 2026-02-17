import { Result } from '../../../lib/Result'
import { BadRequestError } from '../../../lib/errors'
import { findProviderApiKeyByName } from '../../../queries/providerApiKeys/findByName'
import { database } from '../../../client'

export async function validateProviderApiKeyName(
  {
    name,
    workspaceId,
  }: {
    name: string
    workspaceId: number
  },
  db = database,
) {
  const trimmedName = name.trim()
  if (trimmedName.length < 1) {
    return Result.error(
      new BadRequestError('Name must be at least 1 characters long'),
    )
  }
  try {
    await findProviderApiKeyByName(
      { workspaceId, name: trimmedName },
      db,
    )
    return Result.error(
      new BadRequestError('A provider API key with this name already exists'),
    )
  } catch {
    return Result.ok(trimmedName)
  }
}
