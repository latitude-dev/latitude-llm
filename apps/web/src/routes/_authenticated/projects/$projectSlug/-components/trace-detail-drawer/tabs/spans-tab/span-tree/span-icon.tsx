import type { Operation } from "@domain/spans"
import { cn, Icon, ProviderIcon, Tooltip } from "@repo/ui"
import {
  ArrowUpDownIcon,
  BotIcon,
  BoxesIcon,
  BrainIcon,
  DatabaseIcon,
  LinkIcon,
  ListTodoIcon,
  type LucideProps,
  MessageSquareTextIcon,
  PenLineIcon,
  RedoDotIcon,
  ScaleIcon,
  ScrollTextIcon,
  SearchIcon,
  ShieldCheckIcon,
  SparklesIcon,
  WorkflowIcon,
  WrenchIcon,
} from "lucide-react"
import type { SpanRecord } from "../../../../../../../../../domains/spans/spans.functions.ts"

const OPERATION_ICON: Record<string, React.ComponentType<LucideProps>> = {
  chat: MessageSquareTextIcon,
  text_completion: PenLineIcon,
  generate_content: SparklesIcon,
  embeddings: BoxesIcon,
  execute_tool: WrenchIcon,
  invoke_agent: BotIcon,
  agent_step: RedoDotIcon,
  create_agent: BotIcon,
  invoke_workflow: WorkflowIcon,
  plan: ListTodoIcon,
  reranker: ArrowUpDownIcon,
  chain: LinkIcon,
  prompt: ScrollTextIcon,
  retrieval: SearchIcon,
  guardrail: ShieldCheckIcon,
  evaluator: ScaleIcon,
  create_memory: BrainIcon,
  update_memory: BrainIcon,
  upsert_memory: BrainIcon,
  delete_memory: BrainIcon,
  search_memory: SearchIcon,
  create_memory_store: DatabaseIcon,
  delete_memory_store: DatabaseIcon,
} satisfies Record<Exclude<Operation, "unspecified" | (string & {})>, React.ComponentType<LucideProps>>

export function SpanIcon({ span }: { readonly span: SpanRecord }) {
  if (span.provider && span.model) {
    return <Tooltip trigger={<ProviderIcon provider={span.provider} size="sm" />}>{span.operation}</Tooltip>
  }

  const icon = OPERATION_ICON[span.operation]
  if (icon) {
    return (
      <Tooltip trigger={<Icon icon={icon} size="sm" color={span.statusCode === "error" ? "destructive" : "primary"} />}>
        {span.operation}
      </Tooltip>
    )
  }

  return (
    <span
      className={cn(
        "inline-block w-1.5 h-1.5 rounded-full shrink-0",
        span.statusCode === "error" ? "bg-destructive" : "bg-primary",
      )}
    />
  )
}
