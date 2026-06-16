import { cn, Tooltip } from "@repo/ui"
import { formatCount } from "@repo/utils"
import { Link, useParams } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { useHasFeatureFlag } from "../../../../../domains/feature-flags/feature-flags.collection.ts"
import type { SpanRecord } from "../../../../../domains/spans/spans.functions.ts"

export interface ToolPillStat {
  readonly name: string
  /** execute_tool spans calling this tool; 0 = defined but never called. */
  readonly callCount: number
  /** execute_tool spans for this tool that ended in error. */
  readonly errorCount: number
  /** Chat spans whose tool definitions include this tool. */
  readonly definedOnSpans: number
}

export function aggregateToolPills(spans: readonly SpanRecord[] | undefined): readonly ToolPillStat[] {
  if (!spans?.length) return []
  const stats = new Map<string, { callCount: number; errorCount: number; definedOnSpans: number }>()
  const statsFor = (name: string) => {
    let entry = stats.get(name)
    if (!entry) {
      entry = { callCount: 0, errorCount: 0, definedOnSpans: 0 }
      stats.set(name, entry)
    }
    return entry
  }
  for (const span of spans) {
    if (span.operation === "execute_tool" && span.toolName) {
      const entry = statsFor(span.toolName)
      entry.callCount++
      if (span.statusCode === "error") entry.errorCount++
    }
    for (const name of new Set(span.toolNames)) {
      if (name) statsFor(name).definedOnSpans++
    }
  }
  return [...stats.entries()]
    .map(([name, entry]) => ({ name, ...entry }))
    .sort((a, b) => b.callCount - a.callCount || a.name.localeCompare(b.name))
}

export function ToolPill({
  name,
  muted,
  failed,
  suffix,
  tooltip,
}: {
  readonly name: string
  readonly muted?: boolean | undefined
  readonly failed?: boolean | undefined
  readonly suffix?: string | undefined
  readonly tooltip?: ReactNode
}) {
  const { projectSlug } = useParams({ strict: false })
  const toolsEnabled = useHasFeatureFlag("tools")
  const linked = toolsEnabled && typeof projectSlug === "string"

  const pillClass = cn(
    "inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border px-2.5 transition-colors",
    failed ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-border bg-secondary",
    linked &&
      (failed
        ? "cursor-pointer hover:border-destructive/60 hover:bg-destructive/15"
        : "cursor-pointer hover:border-primary/30 hover:bg-primary/10"),
    !linked && "cursor-default",
    muted && "opacity-60",
  )
  const content = (
    <>
      <span className={cn("min-w-0 truncate font-mono text-[13px]", muted && "text-muted-foreground")}>{name}</span>
      {suffix ? (
        <span className={cn("shrink-0 text-xs", failed ? "text-destructive/80" : "text-muted-foreground")}>
          {suffix}
        </span>
      ) : null}
    </>
  )
  const trigger = linked ? (
    <Link
      to="/projects/$projectSlug/tools/$toolName"
      params={{ projectSlug: projectSlug as string, toolName: name }}
      aria-label={`Open ${name} analytics`}
      className={pillClass}
    >
      {content}
    </Link>
  ) : (
    <span className={pillClass}>{content}</span>
  )

  return (
    <Tooltip asChild trigger={trigger}>
      <div className="flex max-w-xs flex-col gap-0.5">
        <span className="break-all font-mono text-xs font-medium">{name}</span>
        {tooltip}
      </div>
    </Tooltip>
  )
}

export function ToolPillList({
  tools,
  scopeLabel,
}: {
  readonly tools: readonly ToolPillStat[]
  readonly scopeLabel: "trace" | "session"
}) {
  if (tools.length === 0) return null
  return (
    <div className="flex flex-row flex-wrap gap-1.5">
      {tools.map((tool) => (
        <ToolPill
          key={tool.name}
          name={tool.name}
          muted={tool.callCount === 0}
          failed={tool.errorCount > 0}
          suffix={tool.callCount > 0 ? `×${formatCount(tool.callCount)}` : undefined}
          tooltip={
            tool.callCount > 0 ? (
              <>
                {formatCount(tool.callCount)} {tool.callCount === 1 ? "call" : "calls"} in this {scopeLabel}
                {tool.errorCount > 0 ? (
                  <span className="text-destructive">{formatCount(tool.errorCount)} failed</span>
                ) : null}
              </>
            ) : (
              `Defined on ${formatCount(tool.definedOnSpans)} ${tool.definedOnSpans === 1 ? "span" : "spans"}, never called`
            )
          }
        />
      ))}
    </div>
  )
}
