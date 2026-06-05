import type { ProjectId } from "@domain/shared"
import { Effect } from "effect"
import {
  type ClusteringCalibration,
  clusteringCalibrationSchema,
  type SessionCalibration,
  sessionCalibrationSchema,
} from "../entities/calibration.ts"
import { CalibrationProfileRepository } from "../ports/calibration-profile-repository.ts"

/**
 * Loads a project's calibrated thresholds, returning null when the project is
 * uncalibrated (callers fall back to the global constants) or when a stored
 * payload no longer parses against the current schema.
 */
export const loadClusteringCalibration = (input: { readonly projectId: ProjectId }) =>
  Effect.gen(function* () {
    const profiles = yield* CalibrationProfileRepository
    const profile = yield* profiles.findByProject({ projectId: input.projectId, scope: "clustering" })
    if (profile === null) return null
    const parsed = clusteringCalibrationSchema.safeParse(profile.payload)
    return parsed.success ? (parsed.data satisfies ClusteringCalibration) : null
  })

export const loadSessionCalibration = (input: { readonly projectId: ProjectId }) =>
  Effect.gen(function* () {
    const profiles = yield* CalibrationProfileRepository
    const profile = yield* profiles.findByProject({ projectId: input.projectId, scope: "conversation" })
    if (profile === null) return null
    const parsed = sessionCalibrationSchema.safeParse(profile.payload)
    return parsed.success ? (parsed.data satisfies SessionCalibration) : null
  })
