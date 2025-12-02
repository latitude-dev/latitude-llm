import crypto from 'crypto'
import {
  DeploymentTest,
  RoutedTo,
} from '../../schema/models/types/DeploymentTest'

/**
 * Determines which variant (baseline or challenger) a request should be routed to
 * Uses session stickiness if customIdentifier is provided
 */
export function routeRequest(
  test: DeploymentTest,
  customIdentifier?: string | null,
): RoutedTo {
  const trafficPercentage = test.trafficPercentage ?? 50

  // Session stickiness: same user/session gets same variant
  if (customIdentifier) {
    const hash = crypto
      .createHash('md5')
      .update(customIdentifier + test.uuid)
      .digest('hex')

    // Convert first 8 chars of hex to a number between 0-100
    const hashNumber = parseInt(hash.substring(0, 8), 16) % 100
    return hashNumber < trafficPercentage ? 'challenger' : 'baseline'
  }

  // Random routing
  return Math.random() * 100 < trafficPercentage ? 'challenger' : 'baseline'
}
