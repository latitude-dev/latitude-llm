import {
  CodeBlock,
  Conversation,
  DetailSection,
  DetailSummary,
  ProviderIcon,
  TagBadgeList,
  Text,
  Tooltip,
} from "@repo/ui"
import { formatCount, formatDuration, relativeTime } from "@repo/utils"
import { ArrowDownRightIcon, ArrowUpRightIcon, BrainIcon, FingerprintIcon, TextIcon } from "lucide-react"
import { useMemo } from "react"
import type { SessionDetailRecord } from "../../../../../../domains/sessions/sessions.functions.ts"
import { UsageSummary } from "../trace-detail-drawer/tabs/spans-tab/span-detail/usage-summary.tsx"

function JsonBlock({ value }: { readonly value: unknown }) {
  const formatted = useMemo(() => JSON.stringify(value, null, 2), [value])
  return <CodeBlock value={formatted} className="bg-secondary" />
}

export function MetadataTab({ session }: { readonly session: SessionDetailRecord }) {
  const hasProviders = session.providers.length > 0
  const hasModels = session.models.length > 0
  const hasTags = session.tags.length > 0
  const hasMetadata = Object.keys(session.metadata).length > 0

  return (
    <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 py-6">
      {/* ── Key facts ── */}
      <DetailSummary
        items={[
          {
            label: "Start Time",
            value: relativeTime(new Date(session.startTime)),
          },
          {
            label: "Duration",
            value: session.durationNs > 0 ? formatDuration(session.durationNs) : "-",
          },
          {
            label: "TTFT",
            value: session.timeToFirstTokenNs > 0 ? formatDuration(session.timeToFirstTokenNs) : "-",
          },
          {
            label: "Spans",
            value: `${formatCount(session.spanCount)}${session.errorCount > 0 ? ` (${session.errorCount} err)` : ""}`,
          },
        ]}
      />

      {/* ── Providers + Models ── */}
      {(hasProviders || hasModels) && (
        <div className="flex flex-row flex-wrap items-center gap-2">
          {hasProviders &&
            session.providers.map((p) => (
              <Tooltip
                key={p}
                asChild
                trigger={
                  <span>
                    <ProviderIcon provider={p} size="sm" />
                  </span>
                }
              >
                {p}
              </Tooltip>
            ))}
          {hasModels && (
            <Text.H5 color="foregroundMuted" noWrap>
              {session.models.join(", ")}
            </Text.H5>
          )}
        </div>
      )}

      <UsageSummary data={session} />

      <div className="flex flex-col gap-1">
        <Text.H6 color="foregroundMuted">Tags</Text.H6>
        {hasTags ? (
          <TagBadgeList tags={session.tags} />
        ) : (
          <Text.H6 color="foregroundMuted" italic>
            No tags
          </Text.H6>
        )}
      </div>

      <DetailSection icon={<TextIcon className="h-4 w-4" />} label="Metadata" defaultOpen={false}>
        {() =>
          hasMetadata ? (
            <JsonBlock value={session.metadata} />
          ) : (
            <Text.H6 color="foregroundMuted" italic>
              No metadata
            </Text.H6>
          )
        }
      </DetailSection>

      <DetailSection icon={<BrainIcon className="h-4 w-4" />} label="System Instructions" defaultOpen={false}>
        {() =>
          session.systemInstructions.length ? (
            <div className="flex flex-col rounded-lg bg-secondary p-4">
              <Conversation messages={[{ role: "system", parts: session.systemInstructions }]} />
            </div>
          ) : (
            <Text.H6 color="foregroundMuted" italic>
              No system instructions
            </Text.H6>
          )
        }
      </DetailSection>

      <DetailSection icon={<ArrowDownRightIcon className="h-4 w-4" />} label="Input" defaultOpen={false}>
        {() =>
          session.inputMessages.length ? (
            <div className="flex flex-col rounded-lg bg-secondary p-4">
              <Conversation messages={session.inputMessages} />
            </div>
          ) : (
            <Text.H6 color="foregroundMuted" italic>
              No input messages
            </Text.H6>
          )
        }
      </DetailSection>

      <DetailSection icon={<ArrowUpRightIcon className="h-4 w-4" />} label="Output" defaultOpen={true}>
        {() =>
          session.outputMessages.length ? (
            <div className="flex flex-col rounded-lg bg-secondary p-4">
              <Conversation messages={session.outputMessages} />
            </div>
          ) : (
            <Text.H6 color="foregroundMuted" italic>
              No output messages
            </Text.H6>
          )
        }
      </DetailSection>

      <DetailSection icon={<FingerprintIcon className="h-4 w-4" />} label="Identifiers" defaultOpen={false}>
        {() => (
          <DetailSummary
            items={[
              { label: "Session ID", value: session.sessionId, copyable: true },
              ...(session.simulationId?.trim()
                ? [
                    {
                      label: "Simulation ID",
                      value: session.simulationId,
                      copyable: true,
                    },
                  ]
                : []),
              ...(session.userId?.trim() ? [{ label: "User ID", value: session.userId, copyable: true }] : []),
              ...(session.rootSpanId?.trim()
                ? [
                    {
                      label: "Root Span ID",
                      value: session.rootSpanId,
                      copyable: true,
                    },
                  ]
                : []),
              ...(session.serviceNames.length > 0
                ? [
                    {
                      label: "Services",
                      value: session.serviceNames.join(", "),
                      copyable: true,
                    },
                  ]
                : []),
            ]}
          />
        )}
      </DetailSection>
    </div>
  )
}
