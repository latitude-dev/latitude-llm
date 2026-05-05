import type { NotFoundError, RepositoryError, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { PublicInvitationPreview } from "../entities/public-invitation-preview.ts"

export class InvitationRepository extends Context.Service<
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
