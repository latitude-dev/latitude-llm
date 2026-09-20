import { z } from "zod"

export const agentScoreDateSchema = z.iso
  .date()
  .refine((date) => date <= new Date().toISOString().slice(0, 10), "Score dates cannot be in the future")
