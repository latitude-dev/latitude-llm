import { userIdSchema } from "@domain/shared"
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
  emailVerified: z.boolean(),
  image: z.string().nullable(),
  role: userRoleSchema,
  createdAt: z.date(),
})

export type User = z.infer<typeof userSchema>
