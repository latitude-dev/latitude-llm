import { ThumbsDownIcon, ThumbsUpIcon } from "lucide-react"
import type { MouseEvent } from "react"
import { cn } from "../../utils/cn.ts"
import { Icon } from "../icons/icons.tsx"

interface ThumbButtonProps {
  readonly selected: boolean
  readonly variant: "up" | "down"
  readonly appearance?: "filled" | "icon"
  readonly onClick: (event: MouseEvent<HTMLButtonElement>) => void
  readonly disabled?: boolean
  /**
   * A recorded verdict rendered as a read-out rather than a control: no hover, no
   * click, no focus, but full-strength styling. `disabled` fades the thumb, which
   * reads as "temporarily unavailable" instead of "this is the answer".
   */
  readonly readOnly?: boolean
}

export function ThumbButton({
  selected,
  variant,
  appearance = "filled",
  onClick,
  disabled,
  readOnly,
}: ThumbButtonProps) {
  const isUp = variant === "up"
  const selectedColor = isUp ? "text-success-muted-foreground" : "text-destructive-muted-foreground"
  const selectedBg = isUp ? "bg-success-muted" : "bg-destructive-muted"

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-disabled={readOnly ? true : undefined}
      tabIndex={readOnly ? -1 : undefined}
      aria-label={isUp ? "Thumbs up" : "Thumbs down"}
      aria-pressed={selected}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-lg transition-colors ring-offset-background",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer",
        // Lets a wrapping tooltip trigger still see the hover.
        readOnly && "pointer-events-none",
        selected
          ? appearance === "filled"
            ? cn(selectedBg, selectedColor)
            : cn(selectedColor, "hover:bg-muted")
          : "text-muted-foreground hover:bg-muted",
      )}
    >
      <Icon icon={isUp ? ThumbsUpIcon : ThumbsDownIcon} size="sm" className="stroke-[2.5]" />
    </button>
  )
}
