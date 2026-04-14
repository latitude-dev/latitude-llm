import { annotationQueueSettingsSchema } from "@domain/annotation-queues"
import type { FilterSet } from "@domain/shared"
import { z } from "zod"

export const queueInputSchema = z.object({
  name: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1, "Queue name is required").max(128)),
  description: z.string().min(1, "Description is required"),
  instructions: z.string().min(1, "Instructions are required"),
  assignees: z.array(z.string()).optional(),
  settings: annotationQueueSettingsSchema.optional(),
})

export interface QueueFormValues {
  name: string
  description: string
  instructions: string
  assignees: string[]
  isLive: boolean
  filters: FilterSet
  sampling: number
}

export function queueFormValuesToSettings(values: QueueFormValues) {
  const hasFilters = values.isLive && Object.keys(values.filters).length > 0
  return {
    ...(hasFilters ? { filter: values.filters, sampling: values.sampling } : {}),
  }
}
