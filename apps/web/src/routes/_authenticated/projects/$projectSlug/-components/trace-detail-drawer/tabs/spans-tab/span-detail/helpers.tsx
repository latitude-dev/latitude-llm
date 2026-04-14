import { CodeBlock, CopyableText, cn, Text } from "@repo/ui"
import { useMemo } from "react"
import type { SpanDetailRecord } from "../../../../../../../../../domains/spans/spans.functions.ts"

export function mergeAttributes(span: SpanDetailRecord): Record<string, string | number | boolean> {
  const merged: Record<string, string | number | boolean> = {}
  for (const [k, v] of Object.entries(span.attrString)) merged[k] = v
  for (const [k, v] of Object.entries(span.attrInt)) merged[k] = v
  for (const [k, v] of Object.entries(span.attrFloat)) merged[k] = v
  for (const [k, v] of Object.entries(span.attrBool)) merged[k] = v
  return Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b)))
}

export function isNonEmptyJson(json: string): boolean {
  return json !== "" && json !== "[]" && json !== "{}" && json !== "null"
}

export function JsonBlock({ value }: { readonly value: unknown }) {
  const formatted = useMemo(() => JSON.stringify(value, null, 2), [value])
  return <CodeBlock value={formatted} copyable className="bg-secondary" />
}

export function StatusBadge({
  statusCode,
  statusMessage,
  spanId,
}: {
  readonly statusCode: string
  readonly statusMessage: string
  readonly spanId: string
}) {
  return (
    <div className="flex flex-row items-center gap-2">
      <span
        className={cn("inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium", {
          "bg-green-500 text-white": statusCode === "ok",
          "bg-red-500 text-white": statusCode === "error",
          "bg-muted text-muted-foreground": statusCode !== "ok" && statusCode !== "error",
        })}
      >
        {statusCode.toUpperCase()}
      </span>
      {statusMessage && <Text.H6 color="foregroundMuted">{statusMessage}</Text.H6>}
      <span className="flex-1" />
      <CopyableText value={spanId} size="sm" tooltip="Copy span ID" />
    </div>
  )
}
