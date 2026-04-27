import { z } from "zod"

export const flaggerAnnotateInputSchema = z.object({
  organizationId: z.string().min(1),
  projectId: z.string().min(1),
  flaggerId: z.string().min(1),
  flaggerSlug: z.string().min(1),
  traceId: z.string().min(1),
  /**
   * Score id to use for the draft annotation row. Generated upstream by
   * `draftFlaggerAnnotationUseCase` so the Latitude telemetry span for the
   * LLM call carries the same id as the persisted score (see PRD: "Identity
   * strategy").
   */
  scoreId: z.string().min(1),
})

export type FlaggerAnnotateInput = z.infer<typeof flaggerAnnotateInputSchema>

export const flaggerAnnotateOutputSchema = z.object({
  flaggerId: z.string().min(1),
  traceId: z.string().min(1),
  draftAnnotationId: z.string().min(1),
  wasCreated: z.boolean(),
})

export type FlaggerAnnotateOutput = z.infer<typeof flaggerAnnotateOutputSchema>

export const flaggerAnnotatorOutputSchema = z.object({
  feedback: z.string().min(1),
})

export type FlaggerAnnotatorOutput = z.infer<typeof flaggerAnnotatorOutputSchema>
