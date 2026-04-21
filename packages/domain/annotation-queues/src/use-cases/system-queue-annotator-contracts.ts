import { z } from "zod"

export const systemQueueAnnotateInputSchema = z.object({
  organizationId: z.string().min(1),
  projectId: z.string().min(1),
  queueSlug: z.string().min(1),
  traceId: z.string().min(1),
  /**
   * Score id to use for the draft annotation row. Generated upstream by
   * `draftSystemQueueAnnotationUseCase` so the Latitude telemetry span for the
   * LLM call carries the same id as the persisted score (see PRD: "Identity
   * strategy").
   */
  scoreId: z.string().min(1),
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
