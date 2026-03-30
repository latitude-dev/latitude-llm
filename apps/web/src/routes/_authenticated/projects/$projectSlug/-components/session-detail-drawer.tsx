import {
  CodeBlock,
  DetailDrawer,
  DetailSection,
  DetailSummary,
  ProviderIcon,
  Skeleton,
  TagBadgeList,
  Text,
  Tooltip,
} from "@repo/ui"
import { formatCount, formatDuration, formatPrice, relativeTime } from "@repo/utils"
import { CopyIcon, FingerprintIcon, TextIcon } from "lucide-react"
import { useMemo } from "react"
import { useSessionDetail } from "../../../../../domains/sessions/sessions.collection.ts"

function JsonBlock({ value }: { readonly value: unknown }) {
  const formatted = useMemo(() => JSON.stringify(value, null, 2), [value])
  return <CodeBlock value={formatted} copyable />
}

export function SessionDetailDrawer({
  sessionId,
  projectId,
  onClose,
}: {
  readonly sessionId: string
  readonly projectId: string
  readonly onClose: () => void
}) {
  const { data: fetchedSession, isLoading } = useSessionDetail({ projectId, sessionId })
  const sessionRecord = fetchedSession ?? undefined
  const isRecordLoading = !sessionRecord && isLoading
  const notFound = !isLoading && !sessionRecord

  const hasTags = sessionRecord && sessionRecord.tags.length > 0
  const hasMetadata = sessionRecord && Object.keys(sessionRecord.metadata).length > 0
  const hasProviders = sessionRecord && sessionRecord.providers.length > 0
  const hasModels = sessionRecord && sessionRecord.models.length > 0

  return (
    <DetailDrawer
      storeKey="session-detail-drawer-width"
      onClose={onClose}
      header={
        <div className="flex flex-col gap-1">
          <div className="flex flex-row items-center gap-2">
            {isRecordLoading ? (
              <Skeleton className="h-6 w-48" />
            ) : (
              <>
                <Text.H4>Session</Text.H4>
                {hasProviders && (
                  <div className="flex items-center gap-1">
                    {sessionRecord.providers.map((p) => (
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
                  </div>
                )}
              </>
            )}
          </div>
          <button
            type="button"
            className="inline-flex shrink-0 items-center gap-1 text-xs leading-4 font-medium text-muted-foreground hover:text-foreground cursor-pointer"
            onClick={() => {
              navigator.clipboard.writeText(sessionId)
            }}
          >
            {isRecordLoading ? (
              <Skeleton className="h-4 w-56" />
            ) : (
              <Text.H6 color="foregroundMuted">{sessionId}</Text.H6>
            )}
            <CopyIcon className="w-4 h-4" />
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-6 py-6 px-4 overflow-y-auto flex-1">
        {notFound ? (
          <Text.H5 color="foregroundMuted">This session was not found in the current project.</Text.H5>
        ) : null}
        {!notFound ? (
          <>
            <DetailSummary
              items={[
                {
                  label: "Start Time",
                  value: sessionRecord ? relativeTime(new Date(sessionRecord.startTime)) : undefined,
                  isLoading: isRecordLoading,
                },
                {
                  label: "End Time",
                  value: sessionRecord ? relativeTime(new Date(sessionRecord.endTime)) : undefined,
                  isLoading: isRecordLoading,
                },
                {
                  label: "Duration",
                  value: sessionRecord ? formatDuration(sessionRecord.durationNs) : undefined,
                  isLoading: isRecordLoading,
                },
                {
                  label: "Traces",
                  value: sessionRecord ? formatCount(sessionRecord.traceCount) : undefined,
                  isLoading: isRecordLoading,
                },
                {
                  label: "Spans",
                  value: sessionRecord
                    ? `${formatCount(sessionRecord.spanCount)}${sessionRecord.errorCount > 0 ? ` (${sessionRecord.errorCount} err)` : ""}`
                    : undefined,
                  isLoading: isRecordLoading,
                },
                {
                  label: "Cost",
                  value: sessionRecord ? formatPrice(sessionRecord.costTotalMicrocents / 100_000_000) : undefined,
                  isLoading: isRecordLoading,
                },
              ]}
            />

            {(hasProviders || hasModels) && sessionRecord && (
              <div className="flex flex-row items-center gap-2 flex-wrap">
                {hasProviders &&
                  sessionRecord.providers.map((p) => (
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
                    {sessionRecord.models.join(", ")}
                  </Text.H5>
                )}
              </div>
            )}

            <div className="flex flex-col gap-1">
              <Text.H6 color="foregroundMuted">Tags</Text.H6>
              {isRecordLoading ? (
                <Skeleton className="h-5 w-32" />
              ) : hasTags ? (
                <TagBadgeList tags={sessionRecord.tags} />
              ) : (
                <Text.H6 color="foregroundMuted" italic>
                  No tags
                </Text.H6>
              )}
            </div>

            <DetailSection icon={<TextIcon className="w-4 h-4" />} label="Metadata">
              {() =>
                isRecordLoading ? (
                  <Skeleton className="h-16 w-full" />
                ) : hasMetadata ? (
                  <JsonBlock value={sessionRecord.metadata} />
                ) : (
                  <Text.H6 color="foregroundMuted" italic>
                    No metadata
                  </Text.H6>
                )
              }
            </DetailSection>

            <DetailSection icon={<FingerprintIcon className="w-4 h-4" />} label="Identifiers" defaultOpen>
              {() => (
                <DetailSummary
                  items={[
                    ...(sessionId.trim() ? [{ label: "Session ID", value: sessionId, copyable: true }] : []),
                    ...(sessionRecord?.simulationId?.trim()
                      ? [{ label: "Simulation ID", value: sessionRecord.simulationId, copyable: true }]
                      : []),
                    ...(sessionRecord?.userId?.trim()
                      ? [{ label: "User ID", value: sessionRecord.userId, copyable: true }]
                      : []),
                  ]}
                />
              )}
            </DetailSection>
          </>
        ) : null}
      </div>
    </DetailDrawer>
  )
}
