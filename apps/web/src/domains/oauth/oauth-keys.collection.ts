import { queryCollectionOptions } from "@tanstack/query-db-collection"
import { createCollection, useLiveQuery } from "@tanstack/react-db"
import { getQueryClient } from "../../lib/data/query-client.tsx"
import { listOAuthKeys, type OAuthKeyRecord, revokeOAuthKey } from "./oauth-keys.functions.ts"

const queryClient = getQueryClient()

const oauthKeysCollection = createCollection(
  queryCollectionOptions({
    queryClient,
    queryKey: ["oauthKeys"],
    queryFn: () => listOAuthKeys(),
    getKey: (item: OAuthKeyRecord) => item.id,
  }),
)

/**
 * Revokes one OAuth key by its `(clientId, userId)` pair and refreshes
 * the cached collection so the table updates in place.
 *
 * No optimistic update — the revoke server-fn performs a few admin
 * queries we don't want to mirror client-side; invalidating after the
 * call is the simpler contract.
 */
export const revokeOAuthKeyMutation = async (input: { clientId: string; userId: string }): Promise<void> => {
  await revokeOAuthKey({ data: input })
  await queryClient.invalidateQueries({ queryKey: ["oauthKeys"] })
}

export const useOAuthKeysCollection = () => {
  return useLiveQuery((query) => query.from({ oauthKey: oauthKeysCollection }))
}
