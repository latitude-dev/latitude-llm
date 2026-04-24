import type { NotFoundError, RepositoryError, SqlClient } from "@domain/shared"
import { type Effect, ServiceMap } from "effect"
import type { PublicInvitationPreview } from "../entities/public-invitation-preview.ts"

export class InvitationRepository extends ServiceMap.Service<
  InvitationRepository,
  {
    /**
     * Pending, non-expired invitation joined to organization name — for unauthenticated invite landing pages.
     */
    findPublicPendingPreviewById: (
      invitationId: string,
    ) => Effect.Effect<PublicInvitationPreview, NotFoundError | RepositoryError, SqlClient>
  }
>()("@domain/organizations/InvitationRepository") {}
