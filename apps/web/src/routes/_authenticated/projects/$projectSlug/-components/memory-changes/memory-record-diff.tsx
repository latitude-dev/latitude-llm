import { CodeDiff, Text } from "@repo/ui"
import type { ReactNode } from "react"
import { looksLikeJson } from "./looks-like-json.ts"

function Centered({ children }: { readonly children: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center">
      <Text.H6 color="foregroundMuted">{children}</Text.H6>
    </div>
  )
}

/**
 * A read-only unified diff of one memory record change. `before`/`after` are the
 * bodies (`null` = an add's missing before or a remove's missing after). When the
 * change is `degraded` (a body was never captured or has been pruned) it renders
 * `fallback` if given, else an "unavailable" note — never a misleading whole-body
 * diff. Shared by the span detail and the session/trace "Memory changes" section.
 */
export function MemoryRecordDiff({
  before,
  after,
  degraded,
  unavailableLabel = "Content not captured for this change",
  fallback,
}: {
  readonly before: string | null
  readonly after: string | null
  readonly degraded: boolean
  readonly unavailableLabel?: string
  readonly fallback?: ReactNode
}) {
  if (degraded) return fallback != null ? fallback : <Centered>{unavailableLabel}</Centered>

  const beforeBody = before ?? ""
  const afterBody = after ?? ""
  if (beforeBody === afterBody) return <Centered>No content changes</Centered>

  const language = looksLikeJson(afterBody) || looksLikeJson(beforeBody) ? "json" : undefined
  return (
    <CodeDiff
      before={beforeBody}
      after={afterBody}
      fillHeight
      className="h-full rounded-none"
      {...(language ? { language } : {})}
    />
  )
}
