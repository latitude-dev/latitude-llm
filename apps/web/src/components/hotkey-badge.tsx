import { Text } from "@repo/ui"
import { formatForDisplay, type RegisterableHotkey } from "@tanstack/react-hotkeys"

export function HotkeyBadge({ hotkey }: { readonly hotkey: RegisterableHotkey }) {
  const label = formatForDisplay(hotkey)
  return (
    <div className="flex items-center px-1 border border-current/30 rounded">
      <Text.H7 asChild color="inherit">
        <kbd>{label}</kbd>
      </Text.H7>
    </div>
  )
}
