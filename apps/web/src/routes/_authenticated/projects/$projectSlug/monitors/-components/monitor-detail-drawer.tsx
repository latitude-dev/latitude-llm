import { ALERT_INCIDENT_KIND_LABEL } from "@domain/shared"
import {
  Button,
  CopyableText,
  DetailDrawer,
  DetailSection,
  Icon,
  LatitudeLogo,
  Skeleton,
  Status,
  Text,
  Tooltip,
  useToast,
} from "@repo/ui"
import { formatCount } from "@repo/utils"
import { useHotkeys } from "@tanstack/react-hotkeys"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BellIcon,
  BellOffIcon,
  CheckIcon,
  LinkIcon,
  PencilIcon,
  ShieldAlertIcon,
} from "lucide-react"
import { type ReactNode, useMemo, useState } from "react"
import { useRegisterCommands } from "../../../../../../components/command-palette/command-palette-provider.tsx"
import type { PaletteCommand } from "../../../../../../components/command-palette/types.ts"
import { HotkeyBadge } from "../../../../../../components/hotkey-badge.tsx"
import { SeverityStatus } from "../../../../../../domains/alerts/severity-selector.tsx"
import { useMonitorIncidentStats } from "../../../../../../domains/monitors/monitors.collection.ts"
import type { MonitorAlertRecord, MonitorRecord } from "../../../../../../domains/monitors/monitors.functions.ts"
import { IncidentResolveConfirmModal } from "./incident-resolve-confirm-modal.tsx"
import { MonitorAlertEditModal } from "./monitor-alert-edit-modal.tsx"
import { MonitorIncidentsTable, MonitorIncidentsTableSkeleton } from "./monitor-incidents-table.tsx"
import { MonitorMuteConfirmModal } from "./monitor-mute-confirm-modal.tsx"
import { MonitorSensitivityEditModal } from "./monitor-sensitivity-edit-modal.tsx"

const SEVERITY_LABEL: Record<MonitorAlertRecord["severity"], string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
}

function SummaryField({ label, value }: { readonly label: string; readonly value: ReactNode }) {
  return (
    <div className="flex min-w-0 max-w-full flex-col gap-0.5">
      <Text.H6 color="foregroundMuted">{label}</Text.H6>
      {value}
    </div>
  )
}

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const MONTH_MS = 30 * DAY_MS
const YEAR_MS = 365 * DAY_MS

function formatCompactElapsed(elapsedMs: number): string {
  if (elapsedMs < HOUR_MS) return `${Math.max(1, Math.floor(elapsedMs / MINUTE_MS))}m`
  if (elapsedMs < DAY_MS) return `${Math.max(1, Math.floor(elapsedMs / HOUR_MS))}h`
  if (elapsedMs < MONTH_MS) return `${Math.max(1, Math.floor(elapsedMs / DAY_MS))}d`
  if (elapsedMs < YEAR_MS) return `${Math.max(1, Math.floor(elapsedMs / MONTH_MS))}mo`
  return `${Math.max(1, Math.floor(elapsedMs / YEAR_MS))}y`
}

const elapsedSince = (iso: string): number => Math.max(0, Date.now() - Date.parse(iso))

function MonitorDetectedAtValue({
  lastDetectedAtIso,
  firstStartedAtIso,
}: {
  readonly lastDetectedAtIso: string
  readonly firstStartedAtIso: string
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 text-sm leading-5">
      <Tooltip
        asChild
        trigger={<span className="break-words">{`${formatCompactElapsed(elapsedSince(lastDetectedAtIso))} ago`}</span>}
      >
        <div className="flex flex-col gap-0.5">
          <Text.H6 color="foregroundMuted">Last detected at</Text.H6>
          <Text.H6B>{new Date(lastDetectedAtIso).toLocaleString()}</Text.H6B>
        </div>
      </Tooltip>
      <span className="shrink-0 text-muted-foreground">/</span>
      <Tooltip
        asChild
        trigger={<span className="break-words">{`${formatCompactElapsed(elapsedSince(firstStartedAtIso))} old`}</span>}
      >
        <div className="flex flex-col gap-0.5">
          <Text.H6 color="foregroundMuted">First detected at</Text.H6>
          <Text.H6B>{new Date(firstStartedAtIso).toLocaleString()}</Text.H6B>
        </div>
      </Tooltip>
    </div>
  )
}

function SystemTag() {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground select-none">
      <LatitudeLogo className="h-3 w-3" />
      System
    </span>
  )
}

function AlertBlock({
  alert,
  monitor,
  onEdit,
}: {
  readonly alert: MonitorAlertRecord
  readonly monitor: MonitorRecord
  readonly onEdit: () => void
}) {
  const canEdit = !monitor.system || alert.kind === "issue.escalating"

  return (
    <div className="flex flex-col gap-1">
      <div className="flex min-w-0 items-center gap-1.5">
        <SeverityStatus
          severity={alert.severity}
          label={`${ALERT_INCIDENT_KIND_LABEL[alert.kind]} · ${SEVERITY_LABEL[alert.severity]}`}
        />
        {canEdit ? (
          <Tooltip
            asChild
            side="bottom"
            trigger={
              <span className="inline-flex shrink-0">
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onEdit} aria-label="Edit alert">
                  <Icon icon={PencilIcon} size="xs" color="foregroundMuted" />
                </Button>
              </span>
            }
          >
            Click to edit this alert
          </Tooltip>
        ) : null}
      </div>
      <Text.H5>{alert.summary}</Text.H5>
    </div>
  )
}

export function MonitorDetailDrawerSkeleton({ onClose }: { readonly onClose: () => void }) {
  return (
    <DetailDrawer
      storeKey="monitor-detail-drawer-width"
      onClose={onClose}
      closeLabel={
        <>
          Close <HotkeyBadge hotkey="Escape" />
        </>
      }
      rightActions={<Skeleton className="h-9 w-20" />}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 flex-col gap-3 border-b px-6 py-4">
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-5 w-72" />
          </div>
          <Skeleton className="h-5 w-40" />
        </div>

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
          <div className="flex flex-row flex-wrap content-start items-start gap-x-8 gap-y-4">
            <SummaryField label="Status" value={<Skeleton className="h-5 w-16" />} />
            <SummaryField label="Detected at" value={<Skeleton className="h-5 w-32" />} />
            <SummaryField label="Incidents" value={<Skeleton className="h-5 w-10" />} />
          </div>

          <div className="flex flex-col gap-2">
            <Text.H6 color="foregroundMuted">Alert</Text.H6>
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-5 w-full" />
          </div>

          <DetailSection
            icon={<Icon icon={ShieldAlertIcon} size="sm" />}
            label="Incidents"
            defaultOpen
            contentClassName="flex flex-col overflow-hidden pl-0 pt-0 max-h-none"
          >
            <MonitorIncidentsTableSkeleton />
          </DetailSection>
        </div>
      </div>
    </DetailDrawer>
  )
}

export function MonitorDetailDrawer({
  projectId,
  projectSlug,
  monitor,
  onClose,
  onNext,
  onPrev,
  canNavigateNext,
  canNavigatePrev,
}: {
  readonly projectId: string
  readonly projectSlug: string
  readonly monitor: MonitorRecord
  readonly onClose: () => void
  readonly onNext?: () => void
  readonly onPrev?: () => void
  readonly canNavigateNext: boolean
  readonly canNavigatePrev: boolean
}) {
  const { toast } = useToast()
  const [muteConfirmOpen, setMuteConfirmOpen] = useState(false)
  const [resolveIncidentId, setResolveIncidentId] = useState<string | null>(null)
  // `null` = closed; an alert = edit that alert (alerts are never added or deleted from the app).
  const [alertModal, setAlertModal] = useState<MonitorAlertRecord | null>(null)
  const [sensitivityAlert, setSensitivityAlert] = useState<MonitorAlertRecord | null>(null)
  const muted = monitor.mutedAt != null
  const { data: incidentStats, isLoading: statsLoading } = useMonitorIncidentStats({
    projectId,
    monitorId: monitor.id,
  })
  const ongoingIncidentId =
    incidentStats && incidentStats.lastIncidentId !== null && incidentStats.lastEndedAtIso === null
      ? incidentStats.lastIncidentId
      : null

  // Registered only while this monitor is open, scoping these palette commands to it.
  const paletteCommands = useMemo<readonly PaletteCommand[]>(
    () => [
      {
        id: `monitor:${monitor.id}:toggle-mute`,
        title: muted ? "Unmute monitor" : "Mute monitor",
        icon: muted ? BellIcon : BellOffIcon,
        section: "context",
        group: "Monitor",
        keywords: muted ? "unmute monitor resume notifications bell" : "mute monitor silence notifications bell",
        perform: () => setMuteConfirmOpen(true),
      },
      ...(ongoingIncidentId
        ? [
            {
              id: `monitor:${monitor.id}:resolve-last-incident`,
              title: "Resolve last incident",
              icon: CheckIcon,
              section: "context",
              group: "Monitor",
              keywords: "resolve incident close ongoing",
              perform: () => setResolveIncidentId(ongoingIncidentId),
            } satisfies PaletteCommand,
          ]
        : []),
      {
        id: `monitor:${monitor.id}:copy-link`,
        title: "Copy monitor link",
        icon: LinkIcon,
        section: "context",
        group: "Monitor",
        keywords: "copy link url share",
        perform: () => {
          void navigator.clipboard.writeText(
            `${window.location.origin}/projects/${projectSlug}/monitors?monitorSlug=${monitor.slug}`,
          )
          toast({ description: "Monitor link copied to clipboard." })
        },
      },
    ],
    [monitor.id, monitor.slug, muted, ongoingIncidentId, projectSlug, toast],
  )
  useRegisterCommands(paletteCommands)

  // System monitors only expose the issue.escalating sensitivity (its own modal);
  // every other editable alert is a user saved-search alert (the alert-form modal).
  const onEditAlert = (alert: MonitorAlertRecord) =>
    alert.kind === "issue.escalating" ? setSensitivityAlert(alert) : setAlertModal(alert)

  useHotkeys([
    {
      hotkey: "Alt+ArrowDown",
      callback: () => onNext?.(),
      options: { enabled: canNavigateNext && !!onNext },
    },
    {
      hotkey: "Alt+ArrowUp",
      callback: () => onPrev?.(),
      options: { enabled: canNavigatePrev && !!onPrev },
    },
    {
      hotkey: "J",
      callback: () => onNext?.(),
      options: { enabled: canNavigateNext && !!onNext },
    },
    {
      hotkey: "K",
      callback: () => onPrev?.(),
      options: { enabled: canNavigatePrev && !!onPrev },
    },
  ])

  return (
    <>
      <DetailDrawer
        storeKey="monitor-detail-drawer-width"
        onClose={onClose}
        closeLabel={
          <>
            Close <HotkeyBadge hotkey="Escape" />
          </>
        }
        actions={
          <>
            <Tooltip
              asChild
              side="bottom"
              trigger={
                <Button
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  disabled={!canNavigateNext}
                  onClick={onNext}
                  type="button"
                  aria-label="Next monitor"
                >
                  <ArrowDownIcon className="h-4 w-4 text-muted-foreground" />
                </Button>
              }
            >
              Next monitor <HotkeyBadge hotkey="Alt+ArrowDown" /> <HotkeyBadge hotkey="J" />
            </Tooltip>
            <Tooltip
              asChild
              side="bottom"
              trigger={
                <Button
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  disabled={!canNavigatePrev}
                  onClick={onPrev}
                  type="button"
                  aria-label="Previous monitor"
                >
                  <ArrowUpIcon className="h-4 w-4 text-muted-foreground" />
                </Button>
              }
            >
              Previous monitor <HotkeyBadge hotkey="Alt+ArrowUp" /> <HotkeyBadge hotkey="K" />
            </Tooltip>
          </>
        }
        rightActions={
          <Button variant="outline" type="button" onClick={() => setMuteConfirmOpen(true)}>
            <Icon icon={muted ? BellIcon : BellOffIcon} size="sm" />
            {muted ? "Unmute" : "Mute"}
          </Button>
        }
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 flex-col gap-3 border-b px-6 py-4">
            <div className="flex flex-col gap-1">
              <Text.H4M>{monitor.name}</Text.H4M>
              {monitor.description ? <Text.H5 color="foregroundMuted">{monitor.description}</Text.H5> : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {monitor.system ? (
                <Tooltip
                  asChild
                  side="bottom"
                  trigger={
                    <span className="inline-flex">
                      <SystemTag />
                    </span>
                  }
                >
                  This monitor is managed by the system
                </Tooltip>
              ) : null}
              <CopyableText value={monitor.slug} size="sm" ellipsis tooltip="Copy monitor slug" />
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
            <div className="flex flex-row flex-wrap content-start items-start gap-x-8 gap-y-4">
              <SummaryField
                label="Status"
                value={muted ? <Status variant="neutral" label="Muted" /> : <Status variant="success" label="Live" />}
              />
              <SummaryField
                label="Detected at"
                value={
                  statsLoading ? (
                    <Skeleton className="h-5 w-32" />
                  ) : incidentStats?.lastStartedAtIso && incidentStats.firstStartedAtIso ? (
                    <MonitorDetectedAtValue
                      // "Last detected at" is the last incident's close time, falling back to its
                      // start while it's still ongoing.
                      lastDetectedAtIso={incidentStats.lastEndedAtIso ?? incidentStats.lastStartedAtIso}
                      firstStartedAtIso={incidentStats.firstStartedAtIso}
                    />
                  ) : (
                    <Text.H5 color="foregroundMuted">—</Text.H5>
                  )
                }
              />
              <SummaryField
                label="Incidents"
                value={
                  statsLoading ? (
                    <Skeleton className="h-5 w-12" />
                  ) : (
                    <Text.H5 color="foreground">{incidentStats ? formatCount(incidentStats.total) : "—"}</Text.H5>
                  )
                }
              />
            </div>

            <div className="flex flex-col gap-2">
              <Text.H6 color="foregroundMuted">{monitor.alerts.length > 1 ? "Alerts" : "Alert"}</Text.H6>
              <div className="flex flex-col gap-4">
                {monitor.alerts.map((alert) => (
                  <AlertBlock key={alert.id} alert={alert} monitor={monitor} onEdit={() => onEditAlert(alert)} />
                ))}
              </div>
            </div>

            <DetailSection
              icon={<Icon icon={ShieldAlertIcon} size="sm" />}
              label="Incidents"
              defaultOpen
              contentClassName="flex flex-col overflow-hidden pl-0 pt-0 max-h-none"
            >
              <MonitorIncidentsTable projectId={projectId} projectSlug={projectSlug} monitorId={monitor.id} />
            </DetailSection>
          </div>
        </div>
      </DetailDrawer>

      <MonitorMuteConfirmModal
        projectId={projectId}
        monitor={muteConfirmOpen ? monitor : null}
        onOpenChange={(next) => setMuteConfirmOpen(next !== null)}
      />

      <IncidentResolveConfirmModal
        projectId={projectId}
        incidentId={resolveIncidentId}
        onOpenChange={setResolveIncidentId}
      />

      {alertModal ? (
        <MonitorAlertEditModal
          projectId={projectId}
          projectSlug={projectSlug}
          monitorId={monitor.id}
          alert={alertModal}
          onClose={() => setAlertModal(null)}
        />
      ) : null}

      {sensitivityAlert ? (
        <MonitorSensitivityEditModal
          projectId={projectId}
          monitorId={monitor.id}
          alert={sensitivityAlert}
          onClose={() => setSensitivityAlert(null)}
        />
      ) : null}
    </>
  )
}
