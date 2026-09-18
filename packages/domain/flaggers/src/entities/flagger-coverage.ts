import { organizationIdSchema, projectIdSchema } from "@domain/shared"
import { z } from "zod"
import { flaggerSlugSchema } from "./flagger.ts"

const coverageCountSchema = z.number().int().nonnegative()

export const flaggerSelectionPathCountsSchema = z.object({
  deterministic: coverageCountSchema,
  hinted: coverageCountSchema,
  uniformSample: coverageCountSchema,
  ordinarySample: coverageCountSchema,
  skipped: coverageCountSchema,
  rateLimited: coverageCountSchema,
})
export type FlaggerSelectionPathCounts = z.infer<typeof flaggerSelectionPathCountsSchema>

export const flaggerCoverageRowSchema = z.object({
  flaggerSlug: flaggerSlugSchema,
  eligibleSessions: coverageCountSchema,
  decidedSessions: coverageCountSchema,
  examinedSessions: coverageCountSchema,
  readableSessions: coverageCountSchema,
  readableShare: z.number().min(0).max(1),
  selectionPaths: flaggerSelectionPathCountsSchema,
  positiveFindings: coverageCountSchema,
  calibrationReadyFindings: coverageCountSchema,
  unknownSelectionProbability: coverageCountSchema,
  unscreenedSessions: coverageCountSchema,
})
export type FlaggerCoverageRow = z.infer<typeof flaggerCoverageRowSchema>

// `from` is the requested start clamped up to `recordingSince`, so it can differ from the caller's.
export const flaggerCoverageReportSchema = z.object({
  organizationId: organizationIdSchema,
  projectId: projectIdSchema,
  from: z.date(),
  to: z.date(),
  recordingSince: z.date().nullable(),
  eligibleSessions: coverageCountSchema,
  sessionsBeforeRecording: coverageCountSchema,
  rows: z.array(flaggerCoverageRowSchema).readonly(),
})
export type FlaggerCoverageReport = z.infer<typeof flaggerCoverageReportSchema>

export const emptyFlaggerCoverageRow = (input: {
  readonly flaggerSlug: FlaggerCoverageRow["flaggerSlug"]
  readonly eligibleSessions: number
}): FlaggerCoverageRow => ({
  flaggerSlug: input.flaggerSlug,
  eligibleSessions: input.eligibleSessions,
  decidedSessions: 0,
  examinedSessions: 0,
  readableSessions: 0,
  readableShare: 0,
  selectionPaths: {
    deterministic: 0,
    hinted: 0,
    uniformSample: 0,
    ordinarySample: 0,
    skipped: 0,
    rateLimited: 0,
  },
  positiveFindings: 0,
  calibrationReadyFindings: 0,
  unknownSelectionProbability: 0,
  unscreenedSessions: input.eligibleSessions,
})
