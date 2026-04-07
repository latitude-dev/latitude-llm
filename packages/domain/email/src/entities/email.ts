import { z } from "zod"

/**
 * Email entity - represents an email to be sent
 *
 * This is a simple data structure that holds email content.
 * The actual sending is handled by the EmailSender port.
 */
export const emailContentSchema = z.object({
  to: z.string().min(1),
  subject: z.string().min(1),
  html: z.string().min(1),
  text: z.string().optional(),
})

export type EmailContent = z.infer<typeof emailContentSchema>

export const templatedEmailSchema = z.object({
  to: z.string().min(1),
  subject: z.string().min(1),
  template: z.string().min(1),
  data: z.unknown(),
})

export type TemplatedEmail<TData = unknown> = Omit<z.infer<typeof templatedEmailSchema>, "data"> & {
  readonly data: TData
}
