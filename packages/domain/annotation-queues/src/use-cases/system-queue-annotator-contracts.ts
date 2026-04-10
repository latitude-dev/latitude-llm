import { z } from "zod"

const matchReasonSchema = z.object({
  key: z.string().min(1),
  thresholdMode: z.string().min(1),
  metric: z.string().min(1),
  values: z.record(z.string(), z.number()),
  thresholds: z.record(z.string(), z.number()),
  medians: z.record(z.string(), z.number()),
})

export const systemQueueAnnotateInputSchema = z.object({
  organizationId: z.string().min(1),
  projectId: z.string().min(1),
  queueSlug: z.string().min(1),
  traceId: z.string().min(1),
  matchReasons: z.array(matchReasonSchema).optional(),
})

export type SystemQueueAnnotateInput = z.infer<typeof systemQueueAnnotateInputSchema>

export const systemQueueAnnotateOutputSchema = z.object({
  queueId: z.string().min(1),
  traceId: z.string().min(1),
  draftAnnotationId: z.string().min(1),
  wasCreated: z.boolean(),
})

export type SystemQueueAnnotateOutput = z.infer<typeof systemQueueAnnotateOutputSchema>

export const systemQueueAnnotatorOutputSchema = z.object({
  feedback: z.string().min(1),
})

export type SystemQueueAnnotatorOutput = z.infer<typeof systemQueueAnnotatorOutputSchema>
