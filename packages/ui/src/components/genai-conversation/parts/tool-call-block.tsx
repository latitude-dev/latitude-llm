import { CheckIcon, ChevronDownIcon, ChevronRightIcon, WrenchIcon, XIcon } from "lucide-react"
import { useState } from "react"
import { cn } from "../../../utils/cn.ts"
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
}: {
  readonly call: ToolCallPart
  readonly result: ToolCallResult | undefined
}) {
  const [open, setOpen] = useState(false)
  const isError = result?.isError === true

  return (
    <div
      className={cn("flex flex-col rounded-lg overflow-hidden border max-w-[600px]", {
        "border-border": !isError,
        "border-destructive": isError,
      })}
    >
      <button
        type="button"
        className="flex flex-row items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50"
        onClick={() => setOpen((prev) => !prev)}
      >
        <WrenchIcon className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="flex-1 text-left">
          <Text.Mono size="h6">{call.name}</Text.Mono>
        </span>
        <ToolCallStatusIcon result={result} />
        {call.id && <CopyButton value={call.id} tooltip={call.id} />}
        {open ? (
          <ChevronDownIcon className="w-3.5 h-3.5 text-muted-foreground" />
        ) : (
          <ChevronRightIcon className="w-3.5 h-3.5 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="flex flex-col">
          <pre className="overflow-auto border-y border-border bg-muted p-3 text-xs">{formatJson(call.arguments)}</pre>
          {result && (
            <div className="flex flex-col p-3">
              <pre
                className={cn("overflow-auto rounded-lg p-3 text-xs", {
                  "bg-muted": !isError,
                  "bg-destructive-muted": isError,
                })}
              >
                {formatJson(result.response)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
