import { useMutation, useQuery } from "@tanstack/react-query"
import { getSandboxDefaultApiKey } from "./sandbox-api-keys.functions.ts"
import { reactivateSandbox } from "./sandbox-lifecycle.functions.ts"

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
 * Reactivate a sandbox (from the sandbox banner). Reactivation always fits the
 * single-sandbox-per-org cap; the UI just reflects the server result.
 */
export function useSandboxLifecycleMutations() {
  const reactivate = useMutation({
    mutationFn: (sandboxOrganizationId: string) => reactivateSandbox({ data: { sandboxOrganizationId } }),
  })

  return { reactivate }
}
