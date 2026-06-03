import { Icon, Text } from "@repo/ui"
import { PlusIcon } from "lucide-react"

export function AddAlertButton({ onClick }: { readonly onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Add alert"
      className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-4 transition-colors hover:border-muted-foreground/40 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Icon icon={PlusIcon} size="sm" color="foregroundMuted" />
      <Text.H5 color="foregroundMuted">Add alert</Text.H5>
    </button>
  )
}
