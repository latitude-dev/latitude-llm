import type { GenAIMessage } from "rosetta-ai"
import { cn } from "../../utils/cn.ts"
import { Part, ReasoningGroup, type ToolCallResult } from "./part.tsx"

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
}: {
  readonly parts: readonly PartType[]
  readonly toolResults?: ReadonlyMap<string, ToolCallResult> | undefined
}) {
  const grouped = groupParts(parts)

  return (
    <div className="flex flex-col gap-2">
      {grouped.map((entry, i) => {
        if (entry.kind === "reasoning") {
          return <ReasoningGroup key={i} texts={entry.texts} />
        }
        const result =
          toolResults && entry.part.type === "tool_call"
            ? toolResults.get((entry.part as { id?: string }).id ?? "")
            : undefined
        return <Part key={i} part={entry.part} toolResult={result} />
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
}: {
  readonly message: GenAIMessage
  readonly toolResults?: ReadonlyMap<string, ToolCallResult> | undefined
}) {
  return (
    <div className="flex flex-col gap-1">
      <PartsRenderer parts={message.parts} toolResults={toolResults} />
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
}: {
  readonly message: GenAIMessage
  readonly alignment?: "left" | "right"
  readonly toolResults?: ReadonlyMap<string, ToolCallResult> | undefined
}) {
  switch (message.role) {
    case "user":
      return <UserMessage message={message} alignment={alignment} />
    case "assistant":
      return <AssistantMessage message={message} toolResults={toolResults} />
    case "system":
      return <SystemMessage message={message} />
    case "tool":
      return <ToolMessage message={message} />
    default:
      return <UnknownRoleMessage message={message} />
  }
}
