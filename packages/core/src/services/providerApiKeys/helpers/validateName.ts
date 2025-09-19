import { Result } from '../../../lib/Result'
import { BadRequestError } from '../../../lib/errors'
import { ProviderApiKeysRepository } from '../../../repositories/providerApiKeysRepository'
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
  const scope = new ProviderApiKeysRepository(workspaceId, db)
  const result = await scope.findByName(trimmedName)
  if (Result.isOk(result)) {
    return Result.error(
      new BadRequestError('A provider API key with this name already exists'),
    )
  }
  return Result.ok(trimmedName)
}
