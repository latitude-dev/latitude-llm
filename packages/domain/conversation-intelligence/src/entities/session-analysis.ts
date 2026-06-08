import { organizationIdSchema, projectIdSchema, sessionIdSchema, traceIdSchema } from "@domain/shared"
import { z } from "zod"
import { ANALYSIS_STATUSES } from "../constants.ts"

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
  analysisStatus: analysisStatusSchema,
  statusReason: z.string(),
  retentionDays: z.number().int().positive(),
  indexedAt: z.date(),
})

export type SessionAnalysis = z.infer<typeof sessionAnalysisSchema>
