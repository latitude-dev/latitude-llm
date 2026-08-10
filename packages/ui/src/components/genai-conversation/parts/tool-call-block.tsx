import { ScanSearchIcon, WrenchIcon, XIcon } from "lucide-react"
import { useMemo } from "react"
import { cn } from "../../../utils/cn.ts"
import { CodeBlockControls } from "../../code-block/code-block-controls.tsx"
import { CopyButton } from "../../copy-button/index.tsx"
import { Icon } from "../../icons/icons.tsx"
import { Text } from "../../text/text.tsx"
import { Tooltip } from "../../tooltip/tooltip.tsx"
import { ChatDropdown } from "./chat-dropdown.tsx"
import { formatJson } from "./helpers.tsx"
import type { ToolCallPart, ToolCallResult } from "./types.ts"

/** Only surfaces a failure — a successful call has no separate status affordance (the badge itself stays neutral). */
function ToolCallStatusIcon({
  result,
  failed = false,
}: {
  readonly result: ToolCallResult | undefined
  readonly failed?: boolean
}) {
  const isError = failed || result?.isError === true
  if (!isError) return null

  return (
    <Tooltip
      trigger={
        <span className="flex items-center">
          <XIcon className="w-3.5 h-3.5 text-destructive" />
        </span>
      }
    >
      <Text.H6>Error</Text.H6>
    </Tooltip>
  )
}

export function ToolCallBlock({
  call,
  result,
  failed = false,
  onNavigateToSpan,
  defaultOpen = false,
}: {
  readonly call: ToolCallPart
  readonly result?: ToolCallResult | undefined
  /** The execution span errored — render as failed even if the result part claims success. */
  readonly failed?: boolean
  readonly onNavigateToSpan?: () => void
  readonly defaultOpen?: boolean
}) {
  const isError = failed || result?.isError === true

  const argsContent = useMemo(() => formatJson(call.arguments), [call.arguments])
  const resultContent = useMemo(() => (result ? formatJson(result.response) : ""), [result])

  const actions = (
    <div className="flex items-center gap-2">
      <ToolCallStatusIcon result={result} failed={failed} />
      {onNavigateToSpan && (
        <Tooltip
          asChild
          trigger={
            <button
              type="button"
              onClick={onNavigateToSpan}
              className="flex cursor-pointer items-center text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/dropdown-row:opacity-100"
            >
              <Icon icon={ScanSearchIcon} size="sm" />
            </button>
          }
        >
          <Text.H6 color="foregroundMuted">View execution span</Text.H6>
        </Tooltip>
      )}
      {call.id && (
        <span className="opacity-0 transition-opacity focus-within:opacity-100 group-hover/dropdown-row:opacity-100">
          <CopyButton value={call.id} tooltip={call.id} />
        </span>
      )}
    </div>
  )

  return (
    <div data-tool-call-id={call.id || undefined} className="flex min-w-0 max-w-full flex-col sm:max-w-150">
      <ChatDropdown
        icon={WrenchIcon}
        title={call.name}
        hasError={isError}
        actions={actions}
        defaultExpanded={defaultOpen}
      >
        <div
          className={cn("flex min-w-0 flex-col gap-2.5 rounded-xl border p-2.5", {
            "border-border": !isError,
            "border-destructive": isError,
          })}
        >
          <div className="flex min-w-0 flex-col gap-1.5 rounded-lg bg-secondary p-3">
            <Text.Mono size="h6" color="foregroundMuted">
              Input
            </Text.Mono>
            <div className="relative">
              <pre className="max-w-full overflow-auto text-xs">{argsContent}</pre>
              <CodeBlockControls content={argsContent} language="json" />
            </div>
          </div>
          {result && (
            <div
              className={cn(
                "flex min-w-0 flex-col gap-1.5 rounded-lg p-3",
                isError ? "bg-destructive-muted" : "bg-secondary",
              )}
            >
              <Text.Mono size="h6" color="foregroundMuted">
                Output
              </Text.Mono>
              <div className="relative">
                <pre className="max-w-full overflow-auto text-xs">{resultContent}</pre>
                <CodeBlockControls content={resultContent} language="json" />
              </div>
            </div>
          )}
        </div>
      </ChatDropdown>
    </div>
  )
}
