import { ChevronDownIcon, ChevronUpIcon, type LucideProps } from "lucide-react"
import { type ComponentType, type ReactNode, useId, useState } from "react"
import { cn } from "../../../utils/cn.ts"
import { Icon } from "../../icons/icons.tsx"
import { Text } from "../../text/text.tsx"

/**
 * Inline disclosure row for conversation views. With an `icon`, the trigger
 * shows it at rest and swaps to a chevron on hover/focus, followed by
 * `title`. Without one (a plain message preview), the trigger has no
 * icon/label at all — `collapsedPreview` alone fills the row, ellipsized.
 * Children render below the trigger when expanded.
 */
export function ChatDropdown({
  icon,
  title,
  hasError = false,
  defaultExpanded = false,
  actions,
  collapsedPreview,
  children,
}: {
  readonly icon?: ComponentType<LucideProps> | undefined
  readonly title?: string | undefined
  /** Tints the icon/title destructive-red (e.g. a failed tool call). */
  readonly hasError?: boolean
  readonly defaultExpanded?: boolean
  /** Optional controls rendered to the right of the trigger, outside the toggle button. */
  readonly actions?: ReactNode
  /** Single-line preview shown while collapsed; hidden once expanded. Badged next to icon+title, or — with neither — the trigger's sole content. */
  readonly collapsedPreview?: ReactNode
  readonly children: ReactNode
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const panelId = useId()
  const hasLabel = Boolean(icon || title)
  const labelColor = hasError ? "destructive" : "foregroundMuted"

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <div className="group/dropdown-row flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          aria-controls={panelId}
          className={cn(
            "group/dropdown flex min-w-0 cursor-pointer items-center gap-1.5",
            hasLabel ? collapsedPreview && "shrink-0" : "w-full",
          )}
        >
          {icon && (
            <>
              <span
                className={cn(
                  "flex shrink-0 group-hover/dropdown:hidden group-focus-visible/dropdown:hidden",
                  hasError ? "text-destructive" : "text-muted-foreground",
                )}
              >
                <Icon icon={icon} size="sm" />
              </span>
              <span className="hidden shrink-0 text-muted-foreground group-hover/dropdown:flex group-focus-visible/dropdown:flex">
                <Icon icon={expanded ? ChevronUpIcon : ChevronDownIcon} size="sm" />
              </span>
            </>
          )}
          {title && (
            <Text.H5 color={labelColor} ellipsis>
              {title}
            </Text.H5>
          )}
          {!hasLabel && !expanded && collapsedPreview && (
            <Text.H5 color="foregroundMuted" ellipsis noWrap>
              {collapsedPreview}
            </Text.H5>
          )}
        </button>
        {hasLabel && !expanded && collapsedPreview && (
          <div
            className={cn("min-w-0 shrink rounded-md px-1.5 py-0.5", hasError ? "bg-destructive-muted" : "bg-muted")}
          >
            <Text.H6M color={labelColor} ellipsis noWrap>
              {collapsedPreview}
            </Text.H6M>
          </div>
        )}
        {actions}
      </div>
      <div id={panelId} className="flex min-w-0 flex-col gap-2 empty:hidden">
        {expanded ? children : null}
      </div>
    </div>
  )
}
