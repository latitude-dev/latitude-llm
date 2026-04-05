import { z } from "zod"

export const publicInvitationPreviewSchema = z.object({
  inviteeEmail: z.string().min(1),
  organizationName: z.string().min(1),
  inviterName: z.string().min(1),
})

export type PublicInvitationPreview = z.infer<typeof publicInvitationPreviewSchema>
