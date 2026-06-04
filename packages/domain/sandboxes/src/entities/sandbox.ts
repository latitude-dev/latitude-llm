import {
  generateId,
  type OrganizationId,
  organizationIdSchema,
  type SandboxId,
  sandboxIdSchema,
  type UserId,
  userIdSchema,
} from "@domain/shared"
import { z } from "zod"

export const sandboxStatusSchema = z.enum(["active", "archived"])
export type SandboxStatus = z.infer<typeof sandboxStatusSchema>

export const sandboxSchema = z.object({
  id: sandboxIdSchema,
  organizationId: organizationIdSchema,
  status: sandboxStatusSchema,
  lastActivityAt: z.date(),
  createdByUserId: userIdSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type Sandbox = z.infer<typeof sandboxSchema>

/**
 * Factory for a freshly-created sandbox attributes row — starts `active` with
 * `lastActivityAt` stamped now.
 */
export const createSandbox = (params: {
  id?: SandboxId | undefined
  organizationId: OrganizationId
  createdByUserId: UserId
  status?: SandboxStatus
  lastActivityAt?: Date
  createdAt?: Date
  updatedAt?: Date
}): Sandbox => {
  const now = new Date()
  return sandboxSchema.parse({
    id: params.id ?? generateId<"SandboxId">(),
    organizationId: params.organizationId,
    status: params.status ?? "active",
    lastActivityAt: params.lastActivityAt ?? now,
    createdByUserId: params.createdByUserId,
    createdAt: params.createdAt ?? now,
    updatedAt: params.updatedAt ?? now,
  })
}
