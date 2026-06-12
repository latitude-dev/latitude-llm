import { cn, Icon, Switch, Text } from "@repo/ui"
import { Boxes } from "lucide-react"

/**
 * Sidebar row with the live/sandbox switch, shared by the live project
 * sidebar (rendered off, flipping enters the sandbox) and the sandbox
 * sidebar (rendered on, flipping returns to live).
 */
export function SandboxToggle({
  collapsed,
  checked,
  loading = false,
  disabled = false,
  onToggle,
}: {
  readonly collapsed: boolean
  readonly checked: boolean
  readonly loading?: boolean
  readonly disabled?: boolean
  readonly onToggle: () => void
}) {
  const actionLabel = checked ? "Switch to live" : "Switch to sandbox"
  // Mirrors NavItem's row markup so the entry is visually identical to Settings.
  const rowClassName = cn("flex items-center rounded-lg transition-colors", {
    "h-10 w-10 justify-center": collapsed,
    "w-full gap-2 px-2 py-2": !collapsed,
    "opacity-50": disabled || loading,
  })

  if (collapsed) {
    return (
      <button
        type="button"
        disabled={disabled || loading}
        onClick={onToggle}
        className={cn(rowClassName, "hover:bg-muted")}
        aria-label={actionLabel}
        title={actionLabel}
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
        checked={checked}
        loading={loading}
        disabled={disabled || loading}
        onCheckedChange={onToggle}
        aria-label={actionLabel}
      />
    </div>
  )
}
