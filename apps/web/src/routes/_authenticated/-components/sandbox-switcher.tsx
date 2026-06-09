import { cn, Icon, Switch, Text, useToast } from "@repo/ui"
import { useQueryClient } from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import { Boxes } from "lucide-react"
import { useState } from "react"
import { useHasFeatureFlag } from "../../../domains/feature-flags/feature-flags.collection.ts"
import { SANDBOXES_QUERY_KEY, useSandboxOrgIdsForParentOrg } from "../../../domains/sandbox/sandbox.collection.ts"
import { createSandbox, deleteSandbox } from "../../../domains/sandbox/sandbox-lifecycle.functions.ts"
import {
  addProductionProjectToSandbox,
  listSandboxProjects,
} from "../../../domains/sandbox/sandbox-projects.functions.ts"
import { toUserMessage } from "../../../lib/errors.ts"

/**
 * Sidebar entry (sits above Settings) that switches the app into the org's
 * single sandbox. Rendered only inside the live project layout, so it always
 * knows the production project the user is currently viewing.
 *
 * Flipping the toggle find-or-creates the org's one sandbox **and** a sandbox
 * project mirroring the current live project (linked by its stable id), then
 * navigates into it — the browser session's active org never changes. There is
 * no sidebar inside the sandbox shell; returning to live is the strip's
 * "Switch to live" link, so the toggle is always rendered *off* here.
 */
export function SandboxSwitcher({ collapsed, projectId }: { readonly collapsed: boolean; readonly projectId: string }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const sandboxEnabled = useHasFeatureFlag("sandbox")
  const { data: sandboxOrgIds, isLoading } = useSandboxOrgIdsForParentOrg({ enabled: sandboxEnabled })
  const [isEntering, setIsEntering] = useState(false)

  // Test Mode is gated: no switcher unless the org has the `sandbox` flag.
  if (!sandboxEnabled) return null

  const enterSandbox = async () => {
    if (isEntering) return
    setIsEntering(true)
    try {
      // 1. Find the org's single sandbox, or create it on first use. If that
      //    sandbox is archived we still navigate into it — the gray strip
      //    surfaces "Activate", which is the intended entry point for waking it.
      let sandboxOrgId = sandboxOrgIds?.[0]
      let createdNow = false
      if (!sandboxOrgId) {
        const { organization } = await createSandbox({ data: { name: "Sandbox" } })
        sandboxOrgId = organization.id
        createdNow = true
        // Fire-and-forget: only refreshes the sidebar's later renders; the id we
        // need is already in hand, so don't block navigation on a round-trip.
        void queryClient.invalidateQueries({ queryKey: SANDBOXES_QUERY_KEY })
      }

      // 2. Find the sandbox project linked to the current live project, or
      //    create it. If creating the project fails right after a fresh
      //    sandbox create, roll the sandbox back so it doesn't orphan (and
      //    wrongly hold the single active slot).
      let projectSlug: string
      try {
        const projects = await listSandboxProjects({ data: { sandboxOrgId } })
        const existing = projects.find((p) => p.linkedProjectId === projectId)
        projectSlug = existing
          ? existing.slug
          : (await addProductionProjectToSandbox({ data: { sandboxOrgId, productionProjectId: projectId } })).slug
      } catch (error) {
        if (createdNow) {
          await deleteSandbox({ data: { sandboxOrganizationId: sandboxOrgId } }).catch(() => {
            // Best-effort cleanup; surface the original error.
          })
        }
        throw error
      }

      // 3. Land on the sandbox project's traces, exactly like the live landing.
      await router.navigate({
        to: "/sandbox/$sandboxOrgId/projects/$projectSlug",
        params: { sandboxOrgId, projectSlug },
      })
    } catch (error) {
      toast({ variant: "destructive", title: "Could not open sandbox", description: toUserMessage(error) })
    } finally {
      setIsEntering(false)
    }
  }

  // Mirrors NavItem's row markup so the entry is visually identical to Settings.
  const rowClassName = cn("flex items-center rounded-lg transition-colors disabled:opacity-50", {
    "h-10 w-10 justify-center": collapsed,
    "w-full gap-2 px-2 py-2": !collapsed,
  })

  if (collapsed) {
    return (
      <button
        type="button"
        disabled={isLoading || isEntering}
        onClick={() => void enterSandbox()}
        className={cn(rowClassName, "hover:bg-muted")}
        aria-label="Sandbox"
        title="Sandbox"
      >
        <Icon icon={Boxes} size="sm" className="text-muted-foreground" />
      </button>
    )
  }

  return (
    <div className={rowClassName}>
      <Icon icon={Boxes} size="sm" className="text-muted-foreground" />
      <Text.H5M color="foregroundMuted" ellipsis className="min-w-0 flex-1 text-left">
        Sandbox
      </Text.H5M>
      <Switch
        checked={false}
        loading={isEntering}
        disabled={isLoading || isEntering}
        onCheckedChange={() => void enterSandbox()}
        aria-label="Switch to sandbox"
      />
    </div>
  )
}
