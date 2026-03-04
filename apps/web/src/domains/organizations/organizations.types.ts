import { z } from "zod"

export const organizationRoleSchema = z.enum(["owner", "admin", "member"])

export interface OrganizationRecord {
  readonly id: string
  readonly name: string
  readonly slug: string
  readonly role: z.infer<typeof organizationRoleSchema>
}
