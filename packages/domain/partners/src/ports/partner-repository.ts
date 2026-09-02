import type { NotFoundError, PartnerId, RepositoryError, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { Partner } from "../entities/partner.ts"

/**
 * Registry of vetted third-party platforms allowed to call the private
 * partner API. `latitude.partners` is a global staff-managed table with no
 * `organization_id` and no RLS policy, so no method takes an org scope.
 *
 * The raw HMAC secret never rides on {@link Partner}: writes pass it through
 * `save`'s options bag and reads go through `findSecretById`, so a partner
 * record is safe to log or hand to the backoffice UI as-is.
 */
export class PartnerRepository extends Context.Service<
  PartnerRepository,
  {
    /** Excludes soft-deleted rows; disabled partners still resolve so callers can report the right reason. */
    findById: (id: PartnerId) => Effect.Effect<Partner, NotFoundError | RepositoryError, SqlClient>
    /** The decrypted HMAC secret. Excludes soft-deleted rows, like `findById`. */
    findSecretById: (id: PartnerId) => Effect.Effect<string, NotFoundError | RepositoryError, SqlClient>
    /** Every live partner, newest first. Includes disabled ones — the backoffice needs to re-enable them. */
    list: () => Effect.Effect<readonly Partner[], RepositoryError, SqlClient>
    /**
     * Upserts the record. `hmacSecret`, when given, replaces the stored ciphertext;
     * omitting it leaves it untouched. Fails `NotFoundError` when the row was
     * soft-deleted after the caller read it, rather than resurrecting it.
     */
    save: (
      partner: Partner,
      options?: { readonly hmacSecret?: string },
    ) => Effect.Effect<void, NotFoundError | RepositoryError, SqlClient>
    softDelete: (id: PartnerId) => Effect.Effect<void, NotFoundError | RepositoryError, SqlClient>
  }
>()("@domain/partners/PartnerRepository") {}
