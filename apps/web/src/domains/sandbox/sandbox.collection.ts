import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { getSandboxDefaultApiKey } from "./sandbox-api-keys.functions.ts"
import { reactivateSandbox } from "./sandbox-lifecycle.functions.ts"
import { listSandboxOrgIdsForParentOrg } from "./sandbox-list.functions.ts"

export const SANDBOXES_QUERY_KEY = ["sandboxes", "parent-org"] as const

/**
 * The active-org's sandbox org ids (active + archived) — all the sidebar toggle
 * needs to find-or-navigate the org's single sandbox. Shares one query key so a
 * create invalidation refreshes it.
 */
export function useSandboxOrgIdsForParentOrg(options?: { readonly enabled?: boolean }) {
  return useQuery<readonly string[]>({
    queryKey: SANDBOXES_QUERY_KEY,
    queryFn: () => listSandboxOrgIdsForParentOrg(),
    staleTime: 30_000,
    enabled: options?.enabled ?? true,
  })
}

/** The sandbox's default `lat_sandbox_` key token — shown in the onboarding empty state. */
export function useSandboxDefaultApiKey(sandboxOrgId: string, enabled = true) {
  return useQuery({
    queryKey: ["sandbox-default-api-key", sandboxOrgId],
    queryFn: () => getSandboxDefaultApiKey({ data: { sandboxOrgId } }),
    staleTime: 60_000,
    enabled,
  })
}

/**
 * Reactivate a sandbox (from the sandbox banner), refreshing the shared sandbox
 * list. Reactivation always fits the single-sandbox-per-org cap; the UI just
 * reflects the server result.
 */
export function useSandboxLifecycleMutations() {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: SANDBOXES_QUERY_KEY })

  const reactivate = useMutation({
    mutationFn: (sandboxOrganizationId: string) => reactivateSandbox({ data: { sandboxOrganizationId } }),
    onSuccess: invalidate,
  })

  return { reactivate }
}
