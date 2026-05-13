import {
  generateId,
  type InvitationId,
  invitationIdSchema,
  organizationIdSchema,
  type UserId,
  userIdSchema,
} from "@domain/shared"
import { z } from "zod"
import { membershipRoleSchema } from "./membership.ts"

/**
 * Status of an organization invitation. Mirrors Better Auth's lifecycle values
 * since the underlying `invitations` table is shared between the web (where BA
 * manages the row) and the API (where our domain use-cases manage it).
 */
export const invitationStatusSchema = z.enum(["pending", "accepted", "rejected", "canceled"])
export type InvitationStatus = z.infer<typeof invitationStatusSchema>

export const invitationSchema = z.object({
  id: invitationIdSchema,
  organizationId: organizationIdSchema,
  email: z.string().min(1),
  role: membershipRoleSchema.nullable(),
  status: invitationStatusSchema,
  expiresAt: z.date(),
  createdAt: z.date(),
  inviterId: userIdSchema,
})

export type Invitation = z.infer<typeof invitationSchema>

/**
 * Default invitation TTL — 48 hours. Matches Better Auth's default for the
 * `organization` plugin so invitations issued via the API behave the same as
 * those issued via the web app.
 */
export const DEFAULT_INVITATION_TTL_MS = 48 * 60 * 60 * 1000

export const createInvitation = (params: {
  id?: InvitationId
  organizationId: z.input<typeof organizationIdSchema>
  email: string
  role?: "owner" | "admin" | "member" | null
  status?: InvitationStatus
  expiresAt?: Date
  createdAt?: Date
  inviterId: UserId
}): Invitation => {
  const now = new Date()
  return invitationSchema.parse({
    id: params.id ?? generateId<"InvitationId">(),
    organizationId: params.organizationId,
    email: params.email,
    role: params.role ?? "member",
    status: params.status ?? "pending",
    expiresAt: params.expiresAt ?? new Date(now.getTime() + DEFAULT_INVITATION_TTL_MS),
    createdAt: params.createdAt ?? now,
    inviterId: params.inviterId,
  })
}
