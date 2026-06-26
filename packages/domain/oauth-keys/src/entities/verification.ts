import { VerificationIdSchema } from "@domain/shared"
import { z } from "zod"

const verificationValueSchema = z.object({
  id: VerificationIdSchema,
  hashedToken: z.string(),
  value: z.string(),
  expiresAt: z.date(),
})

export type VerificationValue = z.infer<typeof verificationValueSchema>
