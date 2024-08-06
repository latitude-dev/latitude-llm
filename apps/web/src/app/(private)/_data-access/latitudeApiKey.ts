import { LatitudeApiKeysRepository, Result } from '@latitude-data/core'
import { getCurrentUser } from '$/services/auth/getCurrentUser'

// NOTE: this would be a great candidate for a cache function with redis
export async function getLatitudeApiKey() {
  const { workspace } = await getCurrentUser()
  const repo = new LatitudeApiKeysRepository(workspace.id)
  const result = await repo.findFirst()

  if (result.error) return result

  return Result.ok(result.value)
}
