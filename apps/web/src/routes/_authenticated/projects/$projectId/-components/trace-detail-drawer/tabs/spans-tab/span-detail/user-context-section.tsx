import { Text } from "@repo/ui"
import type { SpanDetailRecord } from "../../../../../../../../../domains/spans/spans.functions.ts"
import { JsonBlock } from "./helpers.tsx"

export function UserContextSection({ span }: { readonly span: SpanDetailRecord }) {
  const hasTags = span.tags.length > 0
  const hasMetadata = Object.keys(span.metadata).length > 0

  if (!hasTags && !hasMetadata) return null

  return (
    <div className="flex flex-col gap-3">
      {hasTags && (
        <div className="flex flex-col gap-1">
          <Text.H6 color="foregroundMuted">Tags</Text.H6>
          <div className="flex flex-row flex-wrap gap-1">
            {span.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {hasMetadata && (
        <div className="flex flex-col gap-1">
          <Text.H6 color="foregroundMuted">Metadata</Text.H6>
          <JsonBlock value={span.metadata} />
        </div>
      )}
    </div>
  )
}
