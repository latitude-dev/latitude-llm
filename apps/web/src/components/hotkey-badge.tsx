import { Text } from "@repo/ui"
import { formatForDisplay, type RegisterableHotkey } from "@tanstack/react-hotkeys"

export function HotkeyBadge({ hotkey }: { readonly hotkey: RegisterableHotkey }) {
  const label = formatForDisplay(hotkey)
  return (
    <div className="inline-flex shrink-0 items-center rounded border border-current/30 px-1">
      <Text.H7 asChild color="inherit">
        <kbd>{label}</kbd>
      </Text.H7>
    </div>
  )
}
