import { PROMOTION_MAX_SESSIONS, PROMOTION_MIN_SESSIONS, PROMOTION_RATE_FLOOR } from "./constants.ts"

/**
 * Distinct sessions a discovered signal must reach before it is promoted, as a
 * function of how much traffic the project sees in the promotion window.
 *
 * `sessionsInWindow` of 0 (a project with no measurable traffic, or a volume
 * lookup that degraded) resolves to the floor, so an unavailable cache can only
 * make promotion easier.
 */
export const promotionThreshold = (sessionsInWindow: number): number => {
  const volumeRelative = Math.ceil(Math.max(0, sessionsInWindow) * PROMOTION_RATE_FLOOR)
  return Math.min(PROMOTION_MAX_SESSIONS, Math.max(PROMOTION_MIN_SESSIONS, volumeRelative))
}
