import { ScanSearchIcon } from "lucide-react"
import type { GenAIMessage } from "rosetta-ai"
import { cn } from "../../utils/cn.ts"
import { Text } from "../text/text.tsx"
import { Tooltip } from "../tooltip/tooltip.tsx"
import { Part, ReasoningGroup, type ToolCallResult } from "./part.tsx"

export type ToolCallActions = ReadonlyMap<string, () => void>

type PartType = GenAIMessage["parts"][number]

type GroupedEntry = { kind: "part"; part: PartType } | { kind: "reasoning"; texts: string[] }

function groupParts(parts: readonly PartType[]): GroupedEntry[] {
  const result: GroupedEntry[] = []

  for (const part of parts) {
    if (part.type === "reasoning") {
      const last = result[result.length - 1]
      if (last?.kind === "reasoning") {
        last.texts.push((part as { content: string }).content)
      } else {
        result.push({ kind: "reasoning", texts: [(part as { content: string }).content] })
      }
    } else {
      result.push({ kind: "part", part })
    }
  }

  return result
}

function PartsRenderer({
  parts,
  toolResults,
  toolCallActions,
}: {
  readonly parts: readonly PartType[]
  readonly toolResults?: ReadonlyMap<string, ToolCallResult> | undefined
  readonly toolCallActions?: ToolCallActions
}) {
  const grouped = groupParts(parts)

  return (
    <div className="flex flex-col gap-2">
      {grouped.map((entry, i) => {
        if (entry.kind === "reasoning") {
          return <ReasoningGroup key={i} texts={entry.texts} />
        }
        const partId = entry.part.type === "tool_call" ? ((entry.part as { id?: string }).id ?? "") : ""
        const result = toolResults?.get(partId)
        const onNavigateToSpan = toolCallActions?.get(partId)
        return (
          <Part
            key={i}
            part={entry.part}
            {...(result ? { toolResult: result } : {})}
            {...(onNavigateToSpan ? { onNavigateToSpan } : {})}
          />
        )
      })}
    </div>
  )
}

function UserMessage({
  message,
  alignment = "right",
}: {
  readonly message: GenAIMessage
  readonly alignment: "left" | "right"
}) {
  return (
    <div className={cn("flex flex-col gap-1", alignment === "right" ? "items-end" : "items-start")}>
      <div className={cn("rounded-2xl bg-accent px-4 py-3 max-w-[85%]")}>
        <PartsRenderer parts={message.parts} />
      </div>
    </div>
  )
}

function AssistantMessage({
  message,
  toolResults,
  toolCallActions,
  onNavigate,
}: {
  readonly message: GenAIMessage
  readonly toolResults?: ReadonlyMap<string, ToolCallResult> | undefined
  readonly toolCallActions?: ToolCallActions
  readonly onNavigate?: () => void
}) {
  return (
    <div className="relative flex flex-col gap-1">
      {onNavigate && (
        <div className="sticky top-0 h-0 overflow-visible z-10">
          <Tooltip
            asChild
            trigger={
              <button
                type="button"
                onClick={onNavigate}
                className="absolute -left-8 flex items-center justify-center w-6 h-6 rounded-md border border-border bg-background shadow-sm opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground cursor-pointer"
                title="View source span"
              >
                <ScanSearchIcon className="h-4 w-4" />
              </button>
            }
          >
            <Text.H6>View source span</Text.H6>
          </Tooltip>
        </div>
      )}
      <PartsRenderer
        parts={message.parts}
        {...(toolResults ? { toolResults } : {})}
        {...(toolCallActions ? { toolCallActions } : {})}
      />
    </div>
  )
}

function SystemMessage({ message }: { readonly message: GenAIMessage }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="border-l-2 border-accent bg-muted/50 rounded-r-lg px-4 py-3">
        <PartsRenderer parts={message.parts} />
      </div>
    </div>
  )
}

function ToolMessage({ message }: { readonly message: GenAIMessage }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="border border-dashed border-border rounded-lg px-4 py-3">
        <PartsRenderer parts={message.parts} />
      </div>
    </div>
  )
}

function UnknownRoleMessage({ message }: { readonly message: GenAIMessage }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="border-l-2 border-accent bg-muted/50 rounded-r-lg px-4 py-3">
        <PartsRenderer parts={message.parts} />
      </div>
    </div>
  )
}

export function Message({
  message,
  alignment = "right",
  toolResults,
  toolCallActions,
  onNavigate,
}: {
  readonly message: GenAIMessage
  readonly alignment?: "left" | "right"
  readonly toolResults?: ReadonlyMap<string, ToolCallResult> | undefined
  readonly toolCallActions?: ToolCallActions
  readonly onNavigate?: () => void
}) {
  switch (message.role) {
    case "user":
      return <UserMessage message={message} alignment={alignment} />
    case "assistant":
      return (
        <AssistantMessage
          message={message}
          {...(toolResults ? { toolResults } : {})}
          {...(toolCallActions ? { toolCallActions } : {})}
          {...(onNavigate ? { onNavigate } : {})}
        />
      )
    case "system":
      return <SystemMessage message={message} />
    case "tool":
      return <ToolMessage message={message} />
    default:
      return <UnknownRoleMessage message={message} />
  }
}
