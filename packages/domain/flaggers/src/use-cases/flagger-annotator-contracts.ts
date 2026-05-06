import { z } from "zod"

export const flaggerAnnotateInputSchema = z.object({
  organizationId: z.string().min(1),
  projectId: z.string().min(1),
  flaggerId: z.string().min(1),
  flaggerSlug: z.string().min(1),
  traceId: z.string().min(1),
  scoreId: z.string().min(1),
  sessionId: z.string().nullable().optional(),
  simulationId: z.string().nullable().optional(),
})

export type FlaggerAnnotateInput = z.infer<typeof flaggerAnnotateInputSchema>

export const flaggerAnnotateOutputSchema = z.object({
  flaggerId: z.string().min(1),
  traceId: z.string().min(1),
  draftAnnotationId: z.string().min(1),
})

export type FlaggerAnnotateOutput = z.infer<typeof flaggerAnnotateOutputSchema>

export const flaggerAnnotatorOutputSchema = z.object({
  feedback: z.string().min(1),
  messageIndex: z.number().int().nonnegative().optional(),
})

export type FlaggerAnnotatorOutput = z.infer<typeof flaggerAnnotatorOutputSchema>
