import { formatForDisplay, type RegisterableHotkey } from "@tanstack/react-hotkeys"

export function HotkeyBadge({ hotkey }: { hotkey: RegisterableHotkey }) {
  const label = formatForDisplay(hotkey)
  return (
    <kbd className="ml-1.5 inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] leading-none text-muted-foreground">
      {label}
    </kbd>
  )
}
