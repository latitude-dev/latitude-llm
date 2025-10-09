import { database } from '../../client'
import { Result } from '../../lib/Result'
import { FeaturesRepository } from '../../repositories/featuresRepository'
import { isFeatureEnabled } from './isFeatureEnabled'

export async function isFeatureEnabledByName(
  workspaceId: number,
  featureName: string,
  db = database,
) {
  const featuresRepo = new FeaturesRepository(db)
  const featureResult = await featuresRepo.findByName(featureName)
  if (featureResult.error) {
    return Result.ok(false) // Feature doesn't exist, so it's disabled
  }

  const feature = featureResult.value

  // First check if the feature is globally enabled
  if (feature.enabled) {
    return Result.ok(true)
  }

  // If not globally enabled, check workspace-specific setting
  const enabled = await isFeatureEnabled(workspaceId, feature.id, db)
  return Result.ok(enabled)
}
