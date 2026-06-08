import type { OrganizationId } from "@domain/shared"
import { requireSession } from "./auth.ts"
import { resolveSandboxAccess } from "./sandbox-access.ts"

/**
 * Resolves the organization a trace/session read should be scoped to.
 *
 * Live (no `sandboxOrgId`) → the session's active org, as always. Sandbox → the
 * sandbox org, but only after `resolveSandboxAccess` confirms the caller is a
 * member of its parent org (the same gate `sandboxMiddleware` uses). Both the
 * session lookup and the sandbox authorization are plain function calls — no
 * server fn invokes another server fn. The returned id is the *only* org handed
 * to the data layer, so a sandbox read can never touch Live and vice-versa.
 */
export async function resolveOrgScope(data: { readonly sandboxOrgId?: string | undefined }): Promise<OrganizationId> {
  const { userId, organizationId } = await requireSession()
  if (data.sandboxOrgId) {
    const sandbox = await resolveSandboxAccess({ sandboxOrgId: data.sandboxOrgId, userId })
    return sandbox.organizationId
  }
  return organizationId
}
