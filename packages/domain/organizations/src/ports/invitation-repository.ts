import type { NotFoundError, RepositoryError } from "@domain/shared"
import { type Effect } from "effect"
import { EffectService } from "@repo/effect-service"
import type { PublicInvitationPreview } from "../entities/public-invitation-preview.ts"

export class InvitationRepository extends EffectService<
  InvitationRepository,
  {
    /**
     * Pending, non-expired invitation joined to organization name — for unauthenticated invite landing pages.
     */
    findPublicPendingPreviewById: (
      invitationId: string,
    ) => Effect.Effect<PublicInvitationPreview, NotFoundError | RepositoryError>
  }
>()("@domain/organizations/InvitationRepository") {}
