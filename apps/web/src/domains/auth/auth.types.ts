import { z } from "zod"

export const createLoginIntentInputSchema = z.object({
  email: z.string(),
})

type CreateLoginIntentInput = z.infer<typeof createLoginIntentInputSchema>

export const createSignupIntentInputSchema = z.object({
  name: z.string(),
  email: z.string(),
  organizationName: z.string(),
})

type CreateSignupIntentInput = z.infer<typeof createSignupIntentInputSchema>

export const completeAuthIntentInputSchema = z.object({
  intentId: z.string(),
})

type CompleteAuthIntentInput = z.infer<typeof completeAuthIntentInputSchema>
