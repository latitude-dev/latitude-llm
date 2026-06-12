import { useToast } from "@repo/ui"
import { useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { SandboxToggle } from "../../../components/sandbox-toggle.tsx"
import { useHasFeatureFlag } from "../../../domains/feature-flags/feature-flags.collection.ts"
import { enterSandboxProject } from "../../../domains/sandbox/sandbox-lifecycle.functions.ts"
import { toUserMessage } from "../../../lib/errors.ts"

/**
 * Sidebar entry (sits above Settings) that switches the app into the org's
 * single sandbox. Rendered only inside the live project layout, so it always
 * knows the production project the user is currently viewing.
 *
 * Flipping the toggle asks the server to find-or-create the org's one sandbox
 * **and** a sandbox project mirroring the current live project (linked by its
 * stable id), then navigates into it — the browser session's active org never
 * changes. If the sandbox is archived we still navigate into it — the gray
 * strip surfaces "Activate", which is the intended entry point for waking it.
 * The sandbox sidebar renders the same toggle *on*; here it is always *off*.
 */
export function SandboxSwitcher({ collapsed, projectId }: { readonly collapsed: boolean; readonly projectId: string }) {
  const router = useRouter()
  const { toast } = useToast()
  const sandboxEnabled = useHasFeatureFlag("sandbox")
  const [isEntering, setIsEntering] = useState(false)

  // Test Mode is gated: no switcher unless the org has the `sandbox` flag.
  if (!sandboxEnabled) return null

  const enterSandbox = async () => {
    if (isEntering) return
    setIsEntering(true)
    try {
      const { sandboxOrgId, projectSlug } = await enterSandboxProject({ data: { projectId } })
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

  return (
    <SandboxToggle collapsed={collapsed} checked={false} loading={isEntering} onToggle={() => void enterSandbox()} />
  )
}
