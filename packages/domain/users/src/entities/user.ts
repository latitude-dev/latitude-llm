import { notificationPreferencesSchema, userIdSchema } from "@domain/shared"
import { z } from "zod"

/**
 * User entity - represents a user in the system.
 *
 * This is a minimal read-only representation of a user for domain operations.
 * The actual user storage and management is handled by Better Auth.
 */
export const userRoleSchema = z.enum(["user", "admin"])

export const userSchema = z.object({
  id: userIdSchema,
  email: z.string().min(1),
  name: z.string().nullable(),
  jobTitle: z.string().nullable(),
  phoneNumber: z.string().nullable(),
  /**
   * How the user found Latitude, from the onboarding form: either one of the
   * `HEARD_ABOUT_US_OPTIONS` channel slugs, or — when they picked "Other" — the
   * source they typed verbatim. Deliberately not enum-constrained: the free-text
   * case means anything can land here. `null` for users who onboarded before the
   * question existed.
   */
  heardAboutUs: z.string().nullable(),
  emailVerified: z.boolean(),
  image: z.string().nullable(),
  role: userRoleSchema,
  /**
   * Per-channel notification preferences keyed by `NotificationGroup`.
   * `null` when the user has never visited the settings page — readers
   * (`shouldSendEmail`) treat null as "all defaults" (opt-out model).
   */
  notificationPreferences: notificationPreferencesSchema.nullable(),
  createdAt: z.date(),
})

export type User = z.infer<typeof userSchema>
