import { ArrowRightIcon, BotIcon, ScanSearchIcon } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "../../../utils/cn.ts"
import { CopyButton } from "../../copy-button/index.tsx"
import { Icon } from "../../icons/icons.tsx"
import { Text } from "../../text/text.tsx"
import { Tooltip } from "../../tooltip/tooltip.tsx"

/**
 * Renders a subagent handoff as a nested sub-conversation: a left-rail lane (the
 * system-message container idiom) headed by the agent identity, with a two-turn
 * chat peek (its opening request and reply) so it reads as a conversation.
 * "Open conversation" drills into the full transcript.
 */
export interface SubagentCardProps {
  /** Agent display name (agent name or tool name). */
  readonly label: string
  /** The execution failed — render with destructive accents. */
  readonly hasError?: boolean
  /** The subagent conversation's first message, as readable text (input peek). */
  readonly taskPreview?: string | undefined
  /** The subagent conversation's last message, as readable text (output peek). */
  readonly resultPreview?: string | undefined
  /** The spawning tool-call id, for the demoted copy affordance. */
  readonly toolCallId?: string | null | undefined
  /** Opens the subagent's full conversation in place. */
  readonly onOpenConversation?: (() => void) | undefined
  /** Jumps to the subagent's execution span. */
  readonly onNavigateToSpan?: (() => void) | undefined
}

function MiniBubble({
  side,
  tone = "default",
  children,
}: {
  readonly side: "left" | "right"
  readonly tone?: "default" | "error"
  readonly children: ReactNode
}) {
  return (
    <div className={cn("flex min-w-0", side === "right" ? "justify-end" : "justify-start")}>
      <div
        className={cn("min-w-0 max-w-[85%] rounded-2xl px-3 py-1.5", {
          "bg-accent": side === "right",
          "border border-border bg-background": side === "left" && tone === "default",
          "bg-destructive-muted": tone === "error",
        })}
      >
        <Text.H6 color={tone === "error" ? "destructive" : "foreground"}>
          <span className="line-clamp-3 whitespace-pre-wrap">{children}</span>
        </Text.H6>
      </div>
    </div>
  )
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
  return (
    <div
      className={cn(
        "group/subagent my-1 flex min-w-0 max-w-full flex-col gap-2 rounded-r-lg border-l-2 bg-muted/50 py-2 pl-4 pr-3 sm:max-w-150",
        hasError ? "border-destructive" : "border-accent",
      )}
    >
      <div className="flex min-w-0 flex-row items-center gap-2">
        <Icon icon={BotIcon} size="sm" color={hasError ? "destructive" : "foregroundMuted"} />
        <Text.H5M noWrap ellipsis>
          {label}
        </Text.H5M>
        <span className="min-w-0 flex-1" />
        {onNavigateToSpan && (
          <Tooltip
            asChild
            trigger={
              <button
                type="button"
                onClick={onNavigateToSpan}
                className="flex items-center text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/subagent:opacity-100 cursor-pointer"
              >
                <ScanSearchIcon className="h-4 w-4" />
              </button>
            }
          >
            <Text.H6>View execution span</Text.H6>
          </Tooltip>
        )}
        {toolCallId && (
          <span className="opacity-0 transition-opacity group-hover/subagent:opacity-100">
            <CopyButton value={toolCallId} tooltip={toolCallId} />
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        {taskPreview && taskPreview.length > 0 && <MiniBubble side="right">{taskPreview}</MiniBubble>}
        <MiniBubble side="left" tone={hasError ? "error" : "default"}>
          {resultPreview && resultPreview.length > 0 ? resultPreview : "No result returned."}
        </MiniBubble>
      </div>

      {onOpenConversation && (
        <button
          type="button"
          onClick={onOpenConversation}
          className="flex w-fit items-center gap-1 text-primary hover:underline cursor-pointer"
        >
          <Text.H6 color="primary" noWrap>
            Open conversation
          </Text.H6>
          <Icon icon={ArrowRightIcon} size="sm" color="primary" />
        </button>
      )}
    </div>
  )
}
