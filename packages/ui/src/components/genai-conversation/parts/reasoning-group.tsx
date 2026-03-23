import { ChevronRightIcon } from "lucide-react"
import { useState } from "react"
import { Text } from "../../text/text.tsx"

export function ReasoningGroup({ texts }: { readonly texts: readonly string[] }) {
  const [open, setOpen] = useState(false)
  const combined = texts.join("\n\n")

  if (open) {
    return (
      <div className="flex flex-row gap-1">
        <button
          type="button"
          aria-label="Hide reasoning"
          className="shrink-0 w-3.5 min-h-3.5 flex justify-center cursor-pointer group"
          onClick={() => setOpen(false)}
        >
          <div className="w-0.5 h-full bg-muted-foreground/30 group-hover:bg-muted-foreground/50 rounded-full" />
        </button>
        <div className="flex-1 min-w-0">
          <Text.H6 color="foregroundMuted" whiteSpace="preWrap" wordBreak="all">
            <span className="italic">{combined}</span>
          </Text.H6>
        </div>
      </div>
    )
  }

  return (
    <button
      type="button"
      className="flex flex-row items-center gap-1 cursor-pointer text-left group"
      onClick={() => setOpen(true)}
    >
      <ChevronRightIcon className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
      <Text.H6 color="foregroundMuted" noWrap ellipsis>
        <span className="italic">{combined}</span>
      </Text.H6>
    </button>
  )
}
