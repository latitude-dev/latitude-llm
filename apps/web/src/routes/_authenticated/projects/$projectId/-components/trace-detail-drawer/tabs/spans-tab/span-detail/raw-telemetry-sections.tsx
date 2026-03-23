import { DetailSection, Text } from "@repo/ui"
import { CodeIcon, LayersIcon, LinkIcon, ZapIcon } from "lucide-react"
import { useMemo } from "react"
import type { SpanDetailRecord } from "../../../../../../../../../domains/spans/spans.functions.ts"
import { isNonEmptyJson, JsonBlock } from "./helpers.tsx"

export function RawTelemetrySections({
  span,
  mergedAttrs,
}: {
  readonly span: SpanDetailRecord
  readonly mergedAttrs: Record<string, string | number | boolean>
}) {
  const hasAttrs = Object.keys(mergedAttrs).length > 0
  const hasResourceAttrs = Object.keys(span.resourceString).length > 0
  const parsedEvents = useMemo(
    () => (isNonEmptyJson(span.eventsJson) ? JSON.parse(span.eventsJson) : null),
    [span.eventsJson],
  )
  const parsedLinks = useMemo(
    () => (isNonEmptyJson(span.linksJson) ? JSON.parse(span.linksJson) : null),
    [span.linksJson],
  )

  return (
    <>
      <DetailSection icon={<CodeIcon className="w-4 h-4" />} label="Attributes">
        {hasAttrs ? <JsonBlock value={mergedAttrs} /> : <Text.H6 color="foregroundMuted">No attributes</Text.H6>}
      </DetailSection>

      <DetailSection icon={<LayersIcon className="w-4 h-4" />} label="Resource Attributes">
        {hasResourceAttrs ? (
          <JsonBlock value={span.resourceString} />
        ) : (
          <Text.H6 color="foregroundMuted">No resource attributes</Text.H6>
        )}
      </DetailSection>

      <DetailSection icon={<ZapIcon className="w-4 h-4" />} label="Events">
        {parsedEvents ? <JsonBlock value={parsedEvents} /> : <Text.H6 color="foregroundMuted">No events</Text.H6>}
      </DetailSection>

      <DetailSection icon={<LinkIcon className="w-4 h-4" />} label="Links">
        {parsedLinks ? <JsonBlock value={parsedLinks} /> : <Text.H6 color="foregroundMuted">No links</Text.H6>}
      </DetailSection>
    </>
  )
}
