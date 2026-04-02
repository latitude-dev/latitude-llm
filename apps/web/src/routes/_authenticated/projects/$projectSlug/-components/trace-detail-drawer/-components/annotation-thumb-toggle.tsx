import { cn, Icon } from "@repo/ui"
import { ThumbsDownIcon, ThumbsUpIcon } from "lucide-react"

export function AnnotationThumbToggle({
  passed,
  disabled = false,
  editable = true,
  onThumbUp,
  onThumbDown,
}: {
  /** `null` = neither thumb selected (e.g. new annotation). */
  readonly passed: boolean | null
  readonly disabled?: boolean
  readonly editable?: boolean
  readonly onThumbUp: () => void
  readonly onThumbDown: () => void
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        disabled={disabled}
        aria-label="Thumbs up, positive"
        aria-pressed={passed === true}
        onClick={onThumbUp}
        className={cn("flex items-center rounded-md p-1.5 transition-colors", {
          "text-emerald-600 bg-emerald-100 dark:bg-emerald-400/20": passed === true,
          "text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20":
            passed !== true && editable,
          "text-muted-foreground cursor-default opacity-60": !editable,
        })}
      >
        <Icon icon={ThumbsUpIcon} size="sm" aria-hidden />
      </button>
      <button
        type="button"
        disabled={disabled}
        aria-label="Thumbs down, negative"
        aria-pressed={passed === false}
        onClick={onThumbDown}
        className={cn("flex items-center rounded-md p-1.5 transition-colors", {
          "text-red-600 bg-red-100 dark:bg-red-400/20": passed === false,
          "text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20":
            passed !== false && editable,
          "text-muted-foreground cursor-default opacity-60": !editable,
        })}
      >
        <Icon icon={ThumbsDownIcon} size="sm" aria-hidden />
      </button>
    </div>
  )
}
