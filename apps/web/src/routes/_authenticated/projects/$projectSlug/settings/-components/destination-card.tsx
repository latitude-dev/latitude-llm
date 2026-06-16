import { Alert, Badge, Button, Icon, Text, useToast } from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { Pause, Play, Trash2 } from "lucide-react"
import { useState } from "react"
import {
  type DestinationRecord,
  getLatestDestinationSyncRun,
  pauseDestination,
  resumeDestination,
} from "../../../../../../domains/destinations/destinations.functions.ts"
import { toUserMessage } from "../../../../../../lib/errors.ts"
import { DeleteDestinationModal } from "./delete-destination-modal.tsx"
import { DESTINATION_KIND_LABEL, DESTINATION_STATUS_BADGE } from "./destination-display.ts"
import { DestinationFormModal } from "./destination-form-modal.tsx"
import { DestinationLogo } from "./destination-logos/index.tsx"
import { destinationsQueryKey } from "./destinations-section.tsx"

const eventCountFormatter = new Intl.NumberFormat("en-US")

function LastRunSummary({ destination }: { destination: DestinationRecord }) {
  const { data: run } = useQuery({
    queryKey: ["destination-sync-run", destination.id],
    queryFn: () => getLatestDestinationSyncRun({ data: { destinationId: destination.id } }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })

  if (!run) {
    return <Text.H6 color="foregroundMuted">Not synced yet · waiting for the next run</Text.H6>
  }

  const syncedAt = run.finishedAt
  const events = run ? `${eventCountFormatter.format(run.eventsSent)} events` : null

  return (
    <Text.H6 color="foregroundMuted">
      {syncedAt ? `Last synced ${relativeTime(new Date(syncedAt))}` : "Not synced yet"}
      {events ? ` · ${events}` : null}
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
  const status = DESTINATION_STATUS_BADGE[destination.status]
  const hostLabel = destination.config.host.replace(/^https?:\/\//, "")
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)

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
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: destinationsQueryKey(projectId),
      }),
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
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>
        <div className="flex flex-row flex-wrap items-center gap-x-2 gap-y-0.5">
          <Text.H6 color="foregroundMuted">{DESTINATION_KIND_LABEL[destination.kind]}</Text.H6>
          <Text.H6 color="foregroundMuted">·</Text.H6>
          <Text.H6 color="foregroundMuted">{hostLabel}</Text.H6>
          <Text.H6 color="foregroundMuted">·</Text.H6>
          <LastRunSummary destination={destination} />
        </div>
      </div>
    </>
  )

  return (
    <div className="flex flex-col rounded-lg border border-border">
      {destination.status === "quarantined" ? (
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

      {editing ? (
        <DestinationFormModal projectId={projectId} destination={destination} onClose={() => setEditing(false)} />
      ) : null}
      {deleting ? (
        <DeleteDestinationModal projectId={projectId} destination={destination} onClose={() => setDeleting(false)} />
      ) : null}
    </div>
  )
}
