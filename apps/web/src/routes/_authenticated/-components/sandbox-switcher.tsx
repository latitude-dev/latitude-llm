import {
  cn,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icon,
  Text,
} from "@repo/ui"
import { useRouter } from "@tanstack/react-router"
import { Boxes, Plus } from "lucide-react"
import { useState } from "react"
import { useHasFeatureFlag } from "../../../domains/feature-flags/feature-flags.collection.ts"
import { useSandboxesForParentOrg } from "../../../domains/sandbox/sandbox.collection.ts"
import { CreateSandboxModal } from "./create-sandbox-modal.tsx"

/**
 * Sidebar entry (sits above Settings) that switches the app into a sandbox.
 * Styled to match {@link NavItem} (full-width, transparent, `hover:bg-muted`).
 * Disabled while the parent org's sandboxes load. With no sandbox it opens the
 * create modal; with one or more it opens a picker of *active* sandboxes plus a
 * "New sandbox" action. Selecting one navigates into `/sandbox/:id` — the
 * browser session's active org never changes.
 */
export function SandboxSwitcher({ collapsed }: { readonly collapsed: boolean }) {
  const router = useRouter()
  const sandboxEnabled = useHasFeatureFlag("sandbox")
  const { data: sandboxes, isLoading } = useSandboxesForParentOrg({ enabled: sandboxEnabled })
  const [modalOpen, setModalOpen] = useState(false)

  // Test Mode is gated: no switcher unless the org has the `sandbox` flag.
  if (!sandboxEnabled) return null

  const activeSandboxes = (sandboxes ?? []).filter((s) => s.status === "active")
  const hasSandboxes = activeSandboxes.length > 0

  const goToSandbox = (sandboxOrgId: string) =>
    router.navigate({ to: "/sandbox/$sandboxOrgId", params: { sandboxOrgId } })

  // Mirrors NavItem's row markup so the entry is visually identical to Settings.
  const rowClassName = cn("flex items-center rounded-lg transition-colors hover:bg-muted disabled:opacity-50", {
    "h-10 w-10 justify-center": collapsed,
    "w-full gap-2 px-2 py-2": !collapsed,
  })

  const triggerInner = (
    <>
      <Icon icon={Boxes} size="sm" className="text-muted-foreground" />
      {!collapsed ? (
        <Text.H5M color="foregroundMuted" ellipsis className="min-w-0 flex-1 text-left">
          Sandbox
        </Text.H5M>
      ) : null}
    </>
  )

  // No sandboxes (or still loading): a plain button that opens the create modal.
  if (!hasSandboxes) {
    return (
      <>
        <button
          type="button"
          disabled={isLoading}
          onClick={() => setModalOpen(true)}
          className={rowClassName}
          aria-label="Create sandbox"
          title={collapsed ? "Sandbox" : undefined}
        >
          {triggerInner}
        </button>
        <CreateSandboxModal open={modalOpen} onOpenChange={setModalOpen} />
      </>
    )
  }

  return (
    <>
      <DropdownMenuRoot>
        <DropdownMenuTrigger asChild>
          <button type="button" className={rowClassName} aria-label="Sandbox" title={collapsed ? "Sandbox" : undefined}>
            {triggerInner}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-56">
          <DropdownMenuLabel>Switch to sandbox</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {activeSandboxes.map((sandbox) => (
            <DropdownMenuItem key={sandbox.organizationId} onSelect={() => void goToSandbox(sandbox.organizationId)}>
              <span className="min-w-0 flex-1 truncate">{sandbox.name}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setModalOpen(true)} className="gap-2">
            <Icon icon={Plus} size="sm" color="foregroundMuted" />
            Create sandbox
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => void router.navigate({ to: "/settings/$section", params: { section: "sandboxes" } })}
            className="gap-2"
          >
            <Icon icon={Boxes} size="sm" color="foregroundMuted" />
            Manage sandboxes
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenuRoot>
      <CreateSandboxModal open={modalOpen} onOpenChange={setModalOpen} />
    </>
  )
}
