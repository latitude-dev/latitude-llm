import { BotIcon, ScanSearchIcon } from "lucide-react"
import { cn } from "../../../utils/cn.ts"
import { CopyButton } from "../../copy-button/index.tsx"
import { Icon } from "../../icons/icons.tsx"
import { Text } from "../../text/text.tsx"
import { Tooltip } from "../../tooltip/tooltip.tsx"

/**
 * Renders a subagent handoff as a single-line row — icon, agent name, and a
 * one-line preview badge, matching the `chat-dropdown-element` + badge
 * composition used elsewhere. No expand/collapse, no nested dropdown: the
 * row opens the subagent's full conversation in place.
 */
export interface SubagentCardProps {
  /** Agent display name (agent name or tool name). */
  readonly label: string
  /** The execution failed — render with destructive accents. */
  readonly hasError?: boolean
  /** The subagent conversation's first message, as readable text (input peek). Falls back to this when there's no result yet. */
  readonly taskPreview?: string | undefined
  /** The subagent conversation's last message, as readable text (output peek). Preferred as the row's preview badge. */
  readonly resultPreview?: string | undefined
  /** The spawning tool-call id, for the demoted copy affordance. */
  readonly toolCallId?: string | null | undefined
  /** Opens the subagent's full conversation in place. */
  readonly onOpenConversation?: (() => void) | undefined
  /** Jumps to the subagent's execution span. */
  readonly onNavigateToSpan?: (() => void) | undefined
}

export function SubagentCard({
  label,
  hasError = false,
  taskPreview,
  resultPreview,
  toolCallId,
  onOpenConversation,
  onNavigateToSpan,
}: SubagentCardProps) {
  const preview =
    resultPreview && resultPreview.length > 0
      ? resultPreview
      : taskPreview && taskPreview.length > 0
        ? taskPreview
        : "No result returned."

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: pointer convenience; the icon+label button is the keyboard-accessible affordance
    // biome-ignore lint/a11y/useKeyWithClickEvents: same
    <div
      onClick={onOpenConversation}
      className={cn("group/subagent my-1 flex min-w-0 max-w-full items-center gap-2 sm:max-w-150", {
        "cursor-pointer": Boolean(onOpenConversation),
      })}
    >
      <button
        type="button"
        onClick={onOpenConversation}
        disabled={!onOpenConversation}
        className="flex shrink-0 cursor-pointer items-center gap-1.5"
      >
        <Icon icon={BotIcon} size="sm" color={hasError ? "destructive" : "foregroundMuted"} />
        <Text.H5M color={hasError ? "destructive" : "foregroundMuted"} noWrap ellipsis>
          {label}
        </Text.H5M>
      </button>
      <div className={cn("min-w-0 flex-1 rounded-md px-1.5 py-0.5", hasError ? "bg-destructive-muted" : "bg-muted")}>
        <Text.H6M color={hasError ? "destructive" : "foregroundMuted"} ellipsis noWrap>
          {preview}
        </Text.H6M>
      </div>
      {(onNavigateToSpan || toolCallId) && (
        // biome-ignore lint/a11y/noStaticElementInteractions: swallows clicks so the row-level open handler doesn't fire for these actions
        // biome-ignore lint/a11y/useKeyWithClickEvents: the wrapped controls are themselves keyboard-accessible
        <div className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {onNavigateToSpan && (
            <Tooltip
              asChild
              trigger={
                <button
                  type="button"
                  onClick={onNavigateToSpan}
                  className="flex cursor-pointer items-center text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/subagent:opacity-100"
                >
                  <Icon icon={ScanSearchIcon} size="sm" />
                </button>
              }
            >
              <Text.H6 color="foregroundMuted">View execution span</Text.H6>
            </Tooltip>
          )}
          {toolCallId && (
            <span className="opacity-0 transition-opacity group-hover/subagent:opacity-100">
              <CopyButton value={toolCallId} tooltip={toolCallId} />
            </span>
          )}
        </div>
      )}
    </div>
  )
}
