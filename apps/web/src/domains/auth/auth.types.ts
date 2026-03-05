import { z } from "zod"

export const createLoginIntentInputSchema = z.object({
  email: z.string(),
})

export const createSignupIntentInputSchema = z.object({
  name: z.string(),
  email: z.string(),
  organizationName: z.string(),
})
