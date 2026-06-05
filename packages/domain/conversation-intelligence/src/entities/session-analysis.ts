import { organizationIdSchema, projectIdSchema, sessionIdSchema, traceIdSchema } from "@domain/shared"
import { z } from "zod"
import { ANALYSIS_LENSES, ANALYSIS_STATUSES, INTERACTION_KINDS } from "../constants.ts"

export const interactionKindSchema = z.enum(INTERACTION_KINDS)
export type InteractionKind = z.infer<typeof interactionKindSchema>

export const analysisLensSchema = z.enum(ANALYSIS_LENSES)
export type AnalysisLens = z.infer<typeof analysisLensSchema>

export const analysisStatusSchema = z.enum(ANALYSIS_STATUSES)
export type AnalysisStatus = z.infer<typeof analysisStatusSchema>

export const sessionAnalysisSchema = z.object({
  organizationId: organizationIdSchema,
  projectId: projectIdSchema,
  sessionId: sessionIdSchema,
  startTime: z.date(),
  endTime: z.date(),
  traceIds: z.array(traceIdSchema).readonly(),
  analysisHash: z.string().length(64),
  interactionKind: interactionKindSchema,
  analysisLens: analysisLensSchema,
  analysisStatus: analysisStatusSchema,
  statusReason: z.string(),
  detectorVersion: z.string(),
  retentionDays: z.number().int().positive(),
  indexedAt: z.date(),
})

export type SessionAnalysis = z.infer<typeof sessionAnalysisSchema>
