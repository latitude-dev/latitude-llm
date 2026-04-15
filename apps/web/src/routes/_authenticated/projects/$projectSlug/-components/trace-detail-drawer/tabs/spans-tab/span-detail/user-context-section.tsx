import { DetailSection, TagBadgeList, Text } from "@repo/ui"
import { TextIcon } from "lucide-react"
import type { SpanDetailRecord } from "../../../../../../../../../domains/spans/spans.functions.ts"
import { JsonBlock } from "./helpers.tsx"

export function UserContextSection({ span }: { readonly span: SpanDetailRecord }) {
  const hasTags = span.tags.length > 0
  const hasMetadata = Object.keys(span.metadata).length > 0

  return (
    <>
      <div className="flex flex-col gap-1">
        <Text.H6 color="foregroundMuted">Tags</Text.H6>
        {hasTags ? (
          <TagBadgeList tags={span.tags} />
        ) : (
          <Text.H6 color="foregroundMuted" italic>
            No tags
          </Text.H6>
        )}
      </div>

      <DetailSection icon={<TextIcon className="w-4 h-4" />} label="Metadata">
        {hasMetadata ? (
          <JsonBlock value={span.metadata} />
        ) : (
          <Text.H6 color="foregroundMuted" italic>
            No metadata
          </Text.H6>
        )}
      </DetailSection>
    </>
  )
}
