import { organizationIdSchema } from "@domain/shared"
import { z } from "zod"

export const sandboxStatusSchema = z.enum(["active", "archived"])
export type SandboxStatus = z.infer<typeof sandboxStatusSchema>

/**
 * Sandbox attributes (Test Mode) — the 1:1 row that hangs off a sandbox
 * organization (an `organizations` row with `parent_org_id IS NOT NULL`).
 * Carries the sleep/wake lifecycle (`status`, `lastActivityAt`) and creator
 * attribution. The row's presence is itself the operational signal that an org
 * is a sandbox.
 */
export const sandboxSchema = z.object({
  id: z.string(),
  organizationId: organizationIdSchema,
  status: sandboxStatusSchema,
  lastActivityAt: z.date(),
  createdByUserId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type Sandbox = z.infer<typeof sandboxSchema>
