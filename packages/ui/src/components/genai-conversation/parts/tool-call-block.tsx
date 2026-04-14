import { CheckIcon, ChevronDownIcon, ChevronRightIcon, ScanSearchIcon, WrenchIcon, XIcon } from "lucide-react"
import { useId, useState } from "react"
import { cn } from "../../../utils/cn.ts"
import { Button } from "../../button/button.tsx"
import { CopyButton } from "../../copy-button/index.tsx"
import { Text } from "../../text/text.tsx"
import { Tooltip } from "../../tooltip/tooltip.tsx"
import { formatJson } from "./helpers.tsx"
import type { ToolCallPart, ToolCallResult } from "./types.ts"

function ToolCallStatusIcon({ result }: { readonly result: ToolCallResult | undefined }) {
  if (!result) return null

  const label = result.isError ? "Error" : "Success"
  const icon = result.isError ? (
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
  onNavigateToSpan,
}: {
  readonly call: ToolCallPart
  readonly result?: ToolCallResult | undefined
  readonly onNavigateToSpan?: () => void
}) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const isError = result?.isError === true

  const toggleOpen = () => setOpen((prev) => !prev)

  return (
    <div
      className={cn("flex min-w-0 max-w-full flex-col overflow-hidden rounded-lg border sm:max-w-[600px]", {
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
        <WrenchIcon className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="min-w-0 flex-1 text-left">
          <Text.Mono size="h6">{call.name}</Text.Mono>
        </span>
        <ToolCallStatusIcon result={result} />
        {call.id && <CopyButton value={call.id} tooltip={call.id} />}
        {onNavigateToSpan && (
          <Tooltip
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

      <div id={panelId} className={cn("flex min-w-0 flex-col", !open && "hidden")}>
        <pre className="max-w-full overflow-auto border-y border-border bg-muted p-3 text-xs">
          {formatJson(call.arguments)}
        </pre>
        {result && (
          <div className="flex min-w-0 flex-col p-3">
            <pre
              className={cn("max-w-full overflow-auto rounded-lg p-3 text-xs", {
                "bg-muted": !isError,
                "bg-destructive-muted": isError,
              })}
            >
              {formatJson(result.response)}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}
