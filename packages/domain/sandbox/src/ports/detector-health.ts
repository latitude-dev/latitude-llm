import type { CacheError, OrganizationId, ProjectId } from "@domain/shared"
import { Context, type Effect } from "effect"

/**
 * A failed run is a silent false negative (no occurrence, no score), so runs
 * and errors are counted per owner and surfaced as detector health. This
 * observability is part of the runtime contract: it ships with the runtime
 * because the evaluations path needs it just as much as detectors will.
 */
export const DETECTOR_OWNER_TYPES = ["evaluation", "signal"] as const
export type DetectorOwnerType = (typeof DETECTOR_OWNER_TYPES)[number]

export interface DetectorRunRecord {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly ownerType: DetectorOwnerType
  readonly ownerId: string
  readonly errored: boolean
}

export interface DetectorHealthSnapshot {
  readonly runs: number
  readonly errors: number
  readonly degraded: boolean
  /** True only on the transition into degraded within the current window — dedupes surfacing. */
  readonly newlyDegraded: boolean
}

export interface DetectorHealthTrackerShape {
  recordRun(input: DetectorRunRecord): Effect.Effect<DetectorHealthSnapshot, CacheError>
}

export class DetectorHealthTracker extends Context.Service<DetectorHealthTracker, DetectorHealthTrackerShape>()(
  "@domain/sandbox/DetectorHealthTracker",
) {}
