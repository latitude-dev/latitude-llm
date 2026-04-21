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
}

export function ThumbButton({ selected, variant, appearance = "filled", onClick, disabled }: ThumbButtonProps) {
  const isUp = variant === "up"
  const selectedColor = isUp ? "text-success-muted-foreground" : "text-destructive-muted-foreground"
  const selectedBg = isUp ? "bg-success-muted" : "bg-destructive-muted"

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={isUp ? "Thumbs up" : "Thumbs down"}
      aria-pressed={selected}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md transition-colors ring-offset-background",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        selected
          ? appearance === "filled"
            ? cn(selectedBg, selectedColor)
            : cn(selectedColor, "hover:bg-muted")
          : "text-muted-foreground hover:bg-muted",
      )}
    >
      <Icon icon={isUp ? ThumbsUpIcon : ThumbsDownIcon} size="sm" />
    </button>
  )
}
