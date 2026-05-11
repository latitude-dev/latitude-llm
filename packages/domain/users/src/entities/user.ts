import { userIdSchema } from "@domain/shared"
import { z } from "zod"

/**
 * User entity - represents a user in the system.
 *
 * This is a minimal read-only representation of a user for domain operations.
 * The actual user storage and management is handled by Better Auth.
 */
export const userRoleSchema = z.enum(["user", "admin"])

/**
 * Closed set of `jobTitle` values captured by the onboarding role step.
 * Stored verbatim on `users.jobTitle` and forwarded as the `jobTitle` field
 * on the marketing contact. The user entity schema keeps `jobTitle` loose
 * (nullable string) so legacy rows with free-text values still read cleanly,
 * but new writes must match this enum.
 */
export const JOB_TITLE_VALUES = ["engineer", "data-ai-ml", "product-manager", "founder", "other"] as const

export const jobTitleSchema = z.enum(JOB_TITLE_VALUES)
export type JobTitle = z.infer<typeof jobTitleSchema>

/**
 * Accepts a known job title (except the bare sentinel `"other"`) **or** a
 * trimmed custom string when the user picks "other" and types their actual
 * role. Trims before validation so whitespace-only input is rejected.
 */
export const onboardingJobTitleSchema = z
  .string()
  .max(256)
  .transform((v) => v.trim())
  .pipe(z.string().min(1))
  .refine((v) => v !== "other", { message: 'Custom job title required when "other" is selected' })

export const userSchema = z.object({
  id: userIdSchema,
  email: z.string().min(1),
  name: z.string().nullable(),
  jobTitle: z.string().nullable(),
  emailVerified: z.boolean(),
  image: z.string().nullable(),
  role: userRoleSchema,
  createdAt: z.date(),
})

export type User = z.infer<typeof userSchema>
