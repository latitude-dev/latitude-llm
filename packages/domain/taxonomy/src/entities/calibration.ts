import { cuidSchema } from "@domain/shared"
import { z } from "zod"

/**
 * Per-project calibrated thresholds. Every embedding-similarity gate in the
 * pipeline that was hand-picked drifts wrong across corpora (QA: the label
 * anchor threshold sat above the p95 of every kind), so thresholds are
 * derived from each project's own score distributions and stored here, with
 * global constants as the fallback when no profile exists yet.
 *
 * `payload` is scope-specific: parse with `sessionCalibrationSchema` or
 * `clusteringCalibrationSchema` according to `scope`.
 */
export const CALIBRATION_SCOPES = ["conversation", "clustering"] as const
export const calibrationScopeSchema = z.enum(CALIBRATION_SCOPES)
export type CalibrationScope = z.infer<typeof calibrationScopeSchema>

export const anchorCalibrationSchema = z.object({
  /**
   * Cosine gate; 1.01 is the disabled-kind sentinel — a gate no similarity
   * can clear, written when the judge cannot verify a kind's precision.
   */
  threshold: z.number().min(0).max(1.01),
  margin: z.number().min(0).max(1),
})
export type AnchorCalibration = z.infer<typeof anchorCalibrationSchema>

export const sessionCalibrationSchema = z.object({
  /** Per moment-label kind anchor gates. */
  labelAnchors: z.record(z.string(), anchorCalibrationSchema),
  /** Ritual suppression gate for taxonomy observation emission. */
  ritual: anchorCalibrationSchema,
  /** Clamp range for the session-adaptive segmentation continuity threshold. */
  continuity: z.object({
    min: z.number().min(0).max(1),
    default: z.number().min(0).max(1),
    max: z.number().min(0).max(1),
  }),
})
export type SessionCalibration = z.infer<typeof sessionCalibrationSchema>

export const clusteringCalibrationSchema = z.object({
  birthLinkThreshold: z.number().min(0).max(1),
  /** Coarse depth-0 birth density; falls back to the global constant. */
  rootLinkThreshold: z.number().min(0).max(1).optional(),
  birthMaxDiameter: z.number().min(0).max(1),
  assignAbsoluteThreshold: z.number().min(0).max(1),
  assignRelativeMargin: z.number().min(0).max(1),
})
export type ClusteringCalibration = z.infer<typeof clusteringCalibrationSchema>

export const calibrationPayloadSchema = z.union([sessionCalibrationSchema, clusteringCalibrationSchema])
export type CalibrationPayload = z.infer<typeof calibrationPayloadSchema>

export const calibrationProfileSchema = z.object({
  id: cuidSchema,
  organizationId: cuidSchema,
  projectId: cuidSchema,
  scope: calibrationScopeSchema,
  payload: calibrationPayloadSchema,
  /** Quality metrics observed at calibration time (coverage, purity, …). */
  metrics: z.record(z.string(), z.number()),
  sampleSize: z.number().int().nonnegative(),
  computedAt: z.date(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
export type CalibrationProfile = z.infer<typeof calibrationProfileSchema>
