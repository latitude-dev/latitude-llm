import { cn, Text } from "@repo/ui"
import { formatForDisplay, type RegisterableHotkey } from "@tanstack/react-hotkeys"

export function HotkeyBadge({ hotkey }: { readonly hotkey: RegisterableHotkey }) {
  const keys = formatForDisplay(hotkey)
    .split(/[\s+]+/)
    .filter(Boolean)
  return (
    <span className="inline-flex shrink-0 items-center gap-1 align-middle">
      {keys.map((key, index) => (
        <span
          key={`${key}-${index}`}
          className="inline-flex size-5 shrink-0 items-center justify-center rounded border border-current/30"
        >
          <Text.H7 asChild color="inherit" weight="bold" className={cn("leading-none", key.length > 1 && "text-[7px]")}>
            <kbd>{key}</kbd>
          </Text.H7>
        </span>
      ))}
    </span>
  )
}
