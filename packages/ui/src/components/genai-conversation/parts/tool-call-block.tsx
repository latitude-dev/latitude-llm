import {
  BotIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  MessageSquareIcon,
  ScanSearchIcon,
  WrenchIcon,
  XIcon,
} from "lucide-react"
import { useId, useMemo, useState } from "react"
import { cn } from "../../../utils/cn.ts"
import { Badge } from "../../badge/index.tsx"
import { Button } from "../../button/button.tsx"
import { CodeBlockControls } from "../../code-block/code-block-controls.tsx"
import { CopyButton } from "../../copy-button/index.tsx"
import { Text } from "../../text/text.tsx"
import { Tooltip } from "../../tooltip/tooltip.tsx"
import { formatJson } from "./helpers.tsx"
import type { SubagentToolCallInfo, ToolCallPart, ToolCallResult } from "./types.ts"

function ToolCallStatusIcon({
  result,
  failed = false,
}: {
  readonly result: ToolCallResult | undefined
  readonly failed?: boolean
}) {
  if (!result && !failed) return null

  const isError = failed || result?.isError === true
  const label = isError ? "Error" : "Success"
  const icon = isError ? (
    <XIcon className="w-3.5 h-3.5 text-destructive" />
  ) : (
    <CheckIcon className="w-3.5 h-3.5 text-success" />
  )

  return (
    <Tooltip trigger={<span className="flex items-center">{icon}</span>}>
      <Text.H6>{label}</Text.H6>
    </Tooltip>
  )
}

export function ToolCallBlock({
  call,
  result,
  failed = false,
  onNavigateToSpan,
  subagent,
  defaultOpen = false,
}: {
  readonly call: ToolCallPart
  readonly result?: ToolCallResult | undefined
  /** The execution span errored — render as failed even if the result part claims success. */
  readonly failed?: boolean
  readonly onNavigateToSpan?: () => void
  /** When set, marks this tool call as a subagent boundary and adds an open-conversation affordance. */
  readonly subagent?: SubagentToolCallInfo | undefined
  readonly defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const panelId = useId()
  const isError = failed || result?.isError === true

  const toggleOpen = () => setOpen((prev) => !prev)

  const argsContent = useMemo(() => formatJson(call.arguments), [call.arguments])
  const resultContent = useMemo(() => (result ? formatJson(result.response) : ""), [result])

  return (
    <div
      data-tool-call-id={call.id || undefined}
      className={cn("flex min-w-0 max-w-full flex-col overflow-hidden rounded-lg border sm:max-w-150", {
        "border-border": !isError,
        "border-destructive": isError,
      })}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: row is a pointer-only hit target; chevron Button handles keyboard disclosure */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: same — toggle is available via the chevron control */}
      <div
        className="flex min-w-0 flex-row items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50"
        onClick={toggleOpen}
      >
        {subagent ? (
          <BotIcon className="w-3.5 h-3.5 text-muted-foreground" />
        ) : (
          <WrenchIcon className="w-3.5 h-3.5 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 text-left">
          <Text.Mono size="h6">{call.name}</Text.Mono>
        </span>
        {subagent && (
          <Badge variant="outlineMuted" size="small" noWrap iconProps={{ icon: BotIcon, placement: "start" }}>
            Subagent
          </Badge>
        )}
        <ToolCallStatusIcon result={result} failed={failed} />
        {call.id && <CopyButton value={call.id} tooltip={call.id} />}
        {onNavigateToSpan && (
          <Tooltip
            asChild
            trigger={
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onNavigateToSpan()
                }}
                className="flex items-center text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <ScanSearchIcon className="w-4 h-4" />
              </button>
            }
          >
            <Text.H6>View execution span</Text.H6>
          </Tooltip>
        )}
        {subagent?.onOpenConversation && (
          <Tooltip
            asChild
            trigger={
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  subagent.onOpenConversation?.()
                }}
                className="flex items-center text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <MessageSquareIcon className="w-4 h-4" />
              </button>
            }
          >
            <Text.H6>Open conversation</Text.H6>
          </Tooltip>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 text-muted-foreground hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation()
            toggleOpen()
          }}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={open ? "Hide tool call details" : "Show tool call details"}
        >
          {open ? <ChevronDownIcon className="w-3.5 h-3.5" /> : <ChevronRightIcon className="w-3.5 h-3.5" />}
        </Button>
      </div>

      {subagent && (
        <div className="flex min-w-0 flex-row items-center gap-2 border-t border-border bg-muted/30 px-3 py-1.5">
          <Text.H6 color="foregroundMuted" noWrap ellipsis>
            {subagent.label}
          </Text.H6>
          {subagent.model && (
            <Badge variant="muted" size="small" noWrap>
              {subagent.model}
            </Badge>
          )}
          <span className="min-w-0 flex-1" />
          <Text.H6 color="foregroundMuted" noWrap>
            {subagent.statsLabel}
          </Text.H6>
        </div>
      )}

      <div id={panelId} className={cn("flex min-w-0 flex-col", !open && "hidden")}>
        <div className="relative">
          <pre className="max-w-full overflow-auto border-y border-border bg-muted p-3 text-xs">{argsContent}</pre>
          <CodeBlockControls content={argsContent} language="json" />
        </div>
        {result && (
          <div className="flex min-w-0 flex-col p-3">
            <div className="relative">
              <pre
                className={cn("max-w-full overflow-auto rounded-lg p-3 text-xs", {
                  "bg-muted": !isError,
                  "bg-destructive-muted": isError,
                })}
              >
                {resultContent}
              </pre>
              <CodeBlockControls content={resultContent} language="json" />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
