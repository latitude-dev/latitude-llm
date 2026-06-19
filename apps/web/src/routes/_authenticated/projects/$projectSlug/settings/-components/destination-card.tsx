import { deriveDestinationHealth } from "@domain/destinations"
import { Alert, Badge, Button, Icon, Text, useToast } from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { ChevronDown, History, Pause, Play, Trash2 } from "lucide-react"
import { useRef, useState } from "react"
import {
  cancelDestinationBackfill,
  type DestinationRecord,
  type DestinationSyncRunRecord,
  getDestinationFreshness,
  getLatestDestinationSyncRun,
  pauseDestination,
  resumeDestination,
} from "../../../../../../domains/destinations/destinations.functions.ts"
import { toUserMessage } from "../../../../../../lib/errors.ts"
import { BackfillDestinationModal } from "./backfill-destination-modal.tsx"
import { DeleteDestinationModal } from "./delete-destination-modal.tsx"
import { DESTINATION_HEALTH_BADGE, DESTINATION_KIND_LABEL, formatLag } from "./destination-display.ts"
import { DestinationFormModal } from "./destination-form-modal.tsx"
import { DestinationLogo } from "./destination-logos/index.tsx"
import { destinationsQueryKey } from "./destinations-section.tsx"

const eventCountFormatter = new Intl.NumberFormat("en-US")

function LastRunSummary({ run }: { run: DestinationSyncRunRecord | null | undefined }) {
  if (!run) {
    return <Text.H6 color="foregroundMuted">Not synced yet · waiting for the next run</Text.H6>
  }

  return (
    <Text.H6 color="foregroundMuted">
      {`Last synced ${relativeTime(new Date(run.finishedAt))} · ${eventCountFormatter.format(run.eventsSent)} events`}
    </Text.H6>
  )
}

/**
 * Self-contained destination summary + lifecycle actions, reused for both the
 * list and the destination's own detail page. It owns its edit/delete modals
 * and pause/resume, so callers just render it. On the list (`linkToDetail`) the
 * identity links to the detail page and a "View logs" shortcut is shown; on the
 * detail page itself that navigation is suppressed. "Test connection" lives in
 * the edit modal — the probe needs the API key, which is write-only.
 */
export function DestinationCard({
  projectId,
  projectSlug,
  destination,
  linkToDetail = true,
}: {
  readonly projectId: string
  readonly projectSlug: string
  readonly destination: DestinationRecord
  readonly linkToDetail?: boolean
}) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showSources, setShowSources] = useState(false)
  const [backfillOpen, setBackfillOpen] = useState(false)
  // Until this instant, poll freshness even before the worker flips it in-progress, so a
  // just-triggered backfill is picked up within a tick or two instead of after staleTime.
  const pollUntil = useRef(0)

  const { data: latestRun } = useQuery({
    queryKey: ["destination-sync-run", destination.id],
    queryFn: () => getLatestDestinationSyncRun({ data: { destinationId: destination.id } }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })

  const { data: freshness } = useQuery({
    queryKey: ["destination-freshness", destination.id],
    queryFn: () => getDestinationFreshness({ data: { projectId, destinationId: destination.id } }),
    enabled: destination.status === "active",
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    // While a backfill runs the % advances server-side; poll so the bar tracks it and the
    // button frees the moment the chain finishes (or wedges → freshness reports not-in-progress).
    refetchInterval: (query) =>
      query.state.data?.backfillInProgress || Date.now() < pollUntil.current ? 3_000 : false,
  })

  const sourceFreshness = freshness?.sources ?? []
  const health = deriveDestinationHealth({
    status: destination.status,
    sources: sourceFreshness,
    latestRun: latestRun ? { status: latestRun.status, eventsDropped: latestRun.eventsDropped } : null,
  })
  const healthBadge = DESTINATION_HEALTH_BADGE[health.badge]
  const hostLabel = destination.config.host.replace(/^https?:\/\//, "")

  const pause = useMutation({
    mutationFn: () => pauseDestination({ data: { projectId, destinationId: destination.id } }),
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: destinationsQueryKey(projectId),
      }),
    onError: (error) => toast({ variant: "destructive", description: toUserMessage(error) }),
  })
  const resume = useMutation({
    mutationFn: () => resumeDestination({ data: { projectId, destinationId: destination.id } }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: destinationsQueryKey(projectId) })
      if (result.backfillsFailed > 0) {
        toast({
          variant: "destructive",
          description: "Resumed, but the gap backfill couldn't start for every source — retry from Backfill.",
        })
      } else if (result.backfillsStarted > 0) {
        toast({ description: "Resumed. Backfilling the window it missed while paused." })
      } else {
        toast({ description: "Destination resumed." })
      }
    },
    onError: (error) => toast({ variant: "destructive", description: toUserMessage(error) }),
  })

  const cancelBackfill = useMutation({
    mutationFn: () => cancelDestinationBackfill({ data: { projectId, destinationId: destination.id } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: destinationsQueryKey(projectId) })
      void queryClient.invalidateQueries({ queryKey: ["destination-freshness", destination.id] })
      toast({ description: "Backfill cancelled." })
    },
    onError: (error) => toast({ variant: "destructive", description: toUserMessage(error) }),
  })

  const togglePending = pause.isPending || resume.isPending

  const identity = (
    <>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
        <DestinationLogo kind={destination.kind} className="h-5 w-auto" />
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex flex-row items-center gap-2">
          <Text.H5 weight="semibold">{destination.name}</Text.H5>
          <Badge variant={healthBadge.variant}>{healthBadge.label}</Badge>
        </div>
        <div className="flex flex-row flex-wrap items-center gap-x-2 gap-y-0.5">
          <Text.H6 color="foregroundMuted">{DESTINATION_KIND_LABEL[destination.kind]}</Text.H6>
          <Text.H6 color="foregroundMuted">·</Text.H6>
          <Text.H6 color="foregroundMuted">{hostLabel}</Text.H6>
          <Text.H6 color="foregroundMuted">·</Text.H6>
          <LastRunSummary run={latestRun} />
          {destination.status === "active" ? (
            <>
              <Text.H6 color="foregroundMuted">·</Text.H6>
              <Text.H6 color={health.badge === "lagging" ? "warningMutedForeground" : "foregroundMuted"}>
                {formatLag(health.lagMs)}
              </Text.H6>
              {!linkToDetail && sourceFreshness.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setShowSources((open) => !open)}
                  className="flex flex-row items-center gap-0.5 transition-opacity hover:opacity-80"
                >
                  <Text.H6 color="foregroundMuted">{showSources ? "Hide sources" : "By source"}</Text.H6>
                  <Icon
                    icon={ChevronDown}
                    size="sm"
                    className={`transition-transform ${showSources ? "rotate-180" : ""}`}
                  />
                </button>
              ) : null}
            </>
          ) : null}
          {latestRun?.status === "failed" ? (
            <>
              <Text.H6 color="foregroundMuted">·</Text.H6>
              <Text.H6 color="destructiveMutedForeground">last run failed</Text.H6>
            </>
          ) : null}
          {health.eventsDropped > 0 ? (
            <>
              <Text.H6 color="foregroundMuted">·</Text.H6>
              <Text.H6 color="warningMutedForeground">
                {`${eventCountFormatter.format(health.eventsDropped)} dropped`}
              </Text.H6>
            </>
          ) : null}
        </div>
      </div>
    </>
  )

  return (
    <div className="flex flex-col rounded-lg border border-border">
      {destination.status === "quarantined" && !linkToDetail ? (
        <div className="border-b border-border p-4">
          <Alert
            variant="destructive"
            showIcon
            title="Destination quarantined"
            description={
              destination.lastFailureMessage
                ? `Sync stopped after repeated failures: ${destination.lastFailureMessage}. Update the API key to reconnect.`
                : "Sync stopped after repeated failures. Update the API key to reconnect."
            }
          />
        </div>
      ) : null}

      <div className="flex flex-row flex-wrap items-center justify-between gap-x-4 gap-y-2 p-4">
        {linkToDetail ? (
          <Link
            to="/projects/$projectSlug/settings/data-destinations/$destinationId"
            params={{ projectSlug, destinationId: destination.id }}
            className="flex min-w-0 grow flex-row items-center gap-3 rounded-md transition-opacity hover:opacity-80"
          >
            {identity}
          </Link>
        ) : (
          <div className="flex min-w-0 grow flex-row items-center gap-3">{identity}</div>
        )}

        <div className="flex shrink-0 flex-row items-center gap-2">
          {linkToDetail ? (
            <Link
              to="/projects/$projectSlug/settings/data-destinations/$destinationId"
              params={{ projectSlug, destinationId: destination.id }}
            >
              <Button variant="outline" size="sm">
                View logs
              </Button>
            </Link>
          ) : null}
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
          {!linkToDetail && destination.status === "active" ? (
            freshness?.backfillInProgress ? (
              <>
                <Button variant="outline" size="sm" disabled>
                  <Icon icon={History} size="sm" />
                  {freshness?.backfillProgress != null
                    ? `Backfilling… ${Math.round(freshness.backfillProgress * 100)}%`
                    : "Backfilling…"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={cancelBackfill.isPending}
                  onClick={() => cancelBackfill.mutate()}
                >
                  Cancel
                </Button>
              </>
            ) : freshness?.backfillAvailable ? (
              <Button variant="outline" size="sm" onClick={() => setBackfillOpen(true)}>
                <Icon icon={History} size="sm" />
                Backfill
              </Button>
            ) : null
          ) : null}
          {destination.status === "paused" ? (
            <Button variant="outline" size="sm" disabled={togglePending} onClick={() => resume.mutate()}>
              <Icon icon={Play} size="sm" />
              Resume
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={togglePending || destination.status === "quarantined"}
              onClick={() => pause.mutate()}
            >
              <Icon icon={Pause} size="sm" />
              Pause
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setDeleting(true)}>
            <Icon icon={Trash2} size="sm" />
            Delete
          </Button>
        </div>
      </div>

      {!linkToDetail && showSources ? (
        <div className="flex flex-col gap-1 border-t border-border px-4 py-3">
          {sourceFreshness.map((s) => (
            <div key={s.source} className="flex flex-row items-center gap-2">
              <Text.H6 weight="medium">{s.source}</Text.H6>
              <Text.H6 color="foregroundMuted">·</Text.H6>
              <Text.H6 color="foregroundMuted">{formatLag(s.lagMs)}</Text.H6>
            </div>
          ))}
        </div>
      ) : null}

      {editing ? (
        <DestinationFormModal projectId={projectId} destination={destination} onClose={() => setEditing(false)} />
      ) : null}
      {deleting ? (
        <DeleteDestinationModal projectId={projectId} destination={destination} onClose={() => setDeleting(false)} />
      ) : null}
      {backfillOpen ? (
        <BackfillDestinationModal
          projectId={projectId}
          destination={destination}
          onClose={() => setBackfillOpen(false)}
          onStarted={() => {
            pollUntil.current = Date.now() + 60_000
            void queryClient.invalidateQueries({ queryKey: ["destination-freshness", destination.id] })
          }}
        />
      ) : null}
    </div>
  )
}
