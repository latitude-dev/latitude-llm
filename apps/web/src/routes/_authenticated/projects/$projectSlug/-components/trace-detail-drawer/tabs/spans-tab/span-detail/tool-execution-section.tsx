import { CopyButton, DetailSection, DetailSummary, Text } from "@repo/ui"
import { ArrowDownRightIcon, ArrowUpRightIcon, WrenchIcon } from "lucide-react"
import { useMemo } from "react"
import type { SpanDetailRecord } from "../../../../../../../../../domains/spans/spans.functions.ts"
import { JsonBlock, tryParseJson } from "./helpers.tsx"

export function isToolExecutionSpan(span: SpanDetailRecord): boolean {
  return (
    span.operation === "execute_tool" || !!span.toolCallId || !!span.toolName || !!span.toolInput || !!span.toolOutput
  )
}

export function ToolExecutionSection({ span }: { readonly span: SpanDetailRecord }) {
  const parsedInput = useMemo(() => tryParseJson(span.toolInput), [span.toolInput])
  const parsedOutput = useMemo(() => tryParseJson(span.toolOutput), [span.toolOutput])
  const toolName = span.toolName || span.name

  return (
    <>
      {(span.toolCallId || toolName) && (
        <DetailSection icon={<WrenchIcon className="w-4 h-4" />} label="Tool">
          <DetailSummary
            items={[
              ...(toolName ? [{ label: "Tool Name", value: toolName }] : []),
              ...(span.toolCallId ? [{ label: "Tool Call ID", value: span.toolCallId, copyable: true }] : []),
            ]}
          />
        </DetailSection>
      )}

      <DetailSection icon={<ArrowDownRightIcon className="w-4 h-4" />} label="Tool Input">
        {parsedInput !== null ? (
          <JsonBlock value={parsedInput} />
        ) : span.toolInput ? (
          <div className="flex flex-col gap-1">
            <div className="flex flex-row items-center gap-2">
              <Text.H6 color="foreground" className="whitespace-pre-wrap break-all">
                {span.toolInput}
              </Text.H6>
              <CopyButton value={span.toolInput} />
            </div>
          </div>
        ) : (
          <Text.H6 color="foregroundMuted">No input</Text.H6>
        )}
      </DetailSection>

      <DetailSection icon={<ArrowUpRightIcon className="w-4 h-4" />} label="Tool Output">
        {parsedOutput !== null ? (
          <JsonBlock value={parsedOutput} />
        ) : span.toolOutput ? (
          <div className="flex flex-col gap-1">
            <div className="flex flex-row items-center gap-2">
              <Text.H6 color="foreground" className="whitespace-pre-wrap break-all">
                {span.toolOutput}
              </Text.H6>
              <CopyButton value={span.toolOutput} />
            </div>
          </div>
        ) : (
          <Text.H6 color="foregroundMuted">No output</Text.H6>
        )}
      </DetailSection>
    </>
  )
}
