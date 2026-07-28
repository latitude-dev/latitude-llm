import { notificationPreferencesSchema, userIdSchema } from "@domain/shared"
import { z } from "zod"
import { heardAboutUsSchema } from "../constants.ts"

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
   * Attribution channel from the onboarding form. `null` for users who
   * onboarded before the question existed.
   */
  heardAboutUs: heardAboutUsSchema.nullable(),
  /** Free-text source, only ever set alongside `heardAboutUs === "other"`. */
  heardAboutUsOther: z.string().nullable(),
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
