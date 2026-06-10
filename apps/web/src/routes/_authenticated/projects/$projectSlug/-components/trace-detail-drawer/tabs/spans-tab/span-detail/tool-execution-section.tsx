import { CodeBlock, DetailSection, DetailSummary, Text } from "@repo/ui"
import { ArrowDownRightIcon, ArrowUpRightIcon, WrenchIcon } from "lucide-react"
import { useMemo } from "react"
import type { SpanDetailRecord } from "../../../../../../../../../domains/spans/spans.functions.ts"
import { JsonBlock } from "./helpers.tsx"

function tryParseJson(value: string): unknown | null {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

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
          <CodeBlock value={span.toolInput} className="bg-secondary" />
        ) : (
          <Text.H6 color="foregroundMuted">No input</Text.H6>
        )}
      </DetailSection>

      <DetailSection icon={<ArrowUpRightIcon className="w-4 h-4" />} label="Tool Output">
        {parsedOutput !== null ? (
          <JsonBlock value={parsedOutput} />
        ) : span.toolOutput ? (
          <CodeBlock value={span.toolOutput} className="bg-secondary" />
        ) : (
          <Text.H6 color="foregroundMuted">No output</Text.H6>
        )}
      </DetailSection>
    </>
  )
}
