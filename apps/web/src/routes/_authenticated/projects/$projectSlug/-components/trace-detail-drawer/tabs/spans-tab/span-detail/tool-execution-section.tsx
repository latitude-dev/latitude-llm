import { Button, CodeBlock, DetailSection, DetailSummary, Icon, Text } from "@repo/ui"
import { Link, useParams } from "@tanstack/react-router"
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
  const { projectSlug } = useParams({ strict: false })
  const showToolLink = Boolean(span.toolName) && typeof projectSlug === "string"

  return (
    <>
      {(span.toolCallId || toolName) && (
        <DetailSection icon={<WrenchIcon className="w-4 h-4" />} label="Tool">
          <div className="flex flex-col gap-2">
            <DetailSummary
              items={[
                ...(toolName ? [{ label: "Tool Name", value: toolName }] : []),
                ...(span.toolCallId ? [{ label: "Tool Call ID", value: span.toolCallId, copyable: true }] : []),
              ]}
            />
            {showToolLink ? (
              <div className="flex">
                <Button asChild variant="outline" size="sm">
                  <Link
                    to="/projects/$projectSlug/tools/$toolName"
                    params={{ projectSlug: projectSlug as string, toolName: span.toolName }}
                  >
                    <Icon icon={WrenchIcon} size="sm" />
                    View tool analytics
                  </Link>
                </Button>
              </div>
            ) : null}
          </div>
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
