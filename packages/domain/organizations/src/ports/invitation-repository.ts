import type { InvitationId, NotFoundError, RepositoryError, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { Invitation, InvitationStatus } from "../entities/invitation.ts"
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
    /**
     * Returns every pending invitation in the caller's organization (resolved from the RLS context),
     * newest first. Excludes accepted / rejected / canceled rows.
     */
    listPending: () => Effect.Effect<readonly Invitation[], RepositoryError, SqlClient>
    /** Single invitation row by id; org-scoped via RLS. */
    findById: (id: InvitationId) => Effect.Effect<Invitation, NotFoundError | RepositoryError, SqlClient>
    /** Inserts a new invitation row. The caller is responsible for generating the id + expiry. */
    create: (invitation: Invitation) => Effect.Effect<void, RepositoryError, SqlClient>
    /** Updates `status` on a single invitation row (cancel / accept / reject in-flight invitations). */
    setStatus: (id: InvitationId, status: InvitationStatus) => Effect.Effect<void, RepositoryError, SqlClient>
  }
>()("@domain/organizations/InvitationRepository") {}
