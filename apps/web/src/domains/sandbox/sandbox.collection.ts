import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { getSandboxDefaultApiKey } from "./sandbox-api-keys.functions.ts"
import { archiveSandbox, deleteSandbox, reactivateSandbox } from "./sandbox-lifecycle.functions.ts"
import { listSandboxesForParentOrg, type SandboxListItemDto } from "./sandbox-list.functions.ts"

export const SANDBOXES_QUERY_KEY = ["sandboxes", "parent-org"] as const

/**
 * The active-org's sandboxes (active + archived), powering both the sidebar
 * switcher and the "your sandboxes" settings list. Shares one query key so a
 * create/archive/delete invalidation refreshes every consumer at once.
 */
export function useSandboxesForParentOrg(options?: { readonly enabled?: boolean }) {
  return useQuery<readonly SandboxListItemDto[]>({
    queryKey: SANDBOXES_QUERY_KEY,
    queryFn: () => listSandboxesForParentOrg(),
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
 * Archive / reactivate / delete a sandbox, each refreshing the shared sandbox
 * list. The cap (and reactivation-over-cap refusal) is enforced server-side; the
 * UI just reflects the result.
 */
export function useSandboxLifecycleMutations() {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: SANDBOXES_QUERY_KEY })

  const archive = useMutation({
    mutationFn: (sandboxOrganizationId: string) => archiveSandbox({ data: { sandboxOrganizationId } }),
    onSuccess: invalidate,
  })
  const reactivate = useMutation({
    mutationFn: (sandboxOrganizationId: string) => reactivateSandbox({ data: { sandboxOrganizationId } }),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: (sandboxOrganizationId: string) => deleteSandbox({ data: { sandboxOrganizationId } }),
    onSuccess: invalidate,
  })

  return { archive, reactivate, remove }
}
