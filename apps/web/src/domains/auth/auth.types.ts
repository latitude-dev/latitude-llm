import { z } from "zod"

export const createLoginIntentInputSchema = z.object({
  intentId: z.string().optional(),
  email: z.string(),
})

export const createSignupIntentInputSchema = z.object({
  intentId: z.string().optional(),
  name: z.string(),
  email: z.string(),
  organizationName: z.string(),
})

export const completeAuthIntentInputSchema = z.object({
  intentId: z.string(),
  name: z.string().optional(),
})

export const getAuthIntentInfoInputSchema = z.object({
  intentId: z.string(),
})
