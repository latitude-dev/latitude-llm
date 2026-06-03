import { ALERT_INCIDENT_KIND_LABEL } from "@domain/shared"
import {
  Button,
  CopyableText,
  cn,
  DetailDrawer,
  DetailSection,
  Icon,
  LatitudeLogo,
  Skeleton,
  Status,
  type StatusProps,
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
  LinkIcon,
  MegaphoneIcon,
  PencilIcon,
  ShieldAlertIcon,
  XIcon,
} from "lucide-react"
import { type ReactNode, useMemo, useState } from "react"
import { useRegisterCommands } from "../../../../../../components/command-palette/command-palette-provider.tsx"
import type { PaletteCommand } from "../../../../../../components/command-palette/types.ts"
import { HotkeyBadge } from "../../../../../../components/hotkey-badge.tsx"
import { useMonitorIncidentStats } from "../../../../../../domains/monitors/monitors.collection.ts"
import type { MonitorAlertRecord, MonitorRecord } from "../../../../../../domains/monitors/monitors.functions.ts"
import { AddAlertButton } from "./add-alert-button.tsx"
import { MonitorAlertDeleteConfirmModal } from "./monitor-alert-delete-confirm-modal.tsx"
import { MonitorAlertEditModal } from "./monitor-alert-edit-modal.tsx"
import { MonitorIncidentsTable, MonitorIncidentsTableSkeleton } from "./monitor-incidents-table.tsx"
import { MonitorMuteConfirmModal } from "./monitor-mute-confirm-modal.tsx"
import { MonitorSensitivityEditModal } from "./monitor-sensitivity-edit-modal.tsx"

const SEVERITY_VARIANT: Record<MonitorAlertRecord["severity"], StatusProps["variant"]> = {
  low: "neutral",
  medium: "warning",
  high: "destructive",
}

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

// Flex `div` so the `gap-*` around the separator holds; bare `<span>` triggers so Radix's hover handlers land on a real DOM node.
function MonitorDetectedAtValue({
  lastStartedAtIso,
  firstStartedAtIso,
}: {
  readonly lastStartedAtIso: string
  readonly firstStartedAtIso: string
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 text-sm leading-5">
      <Tooltip
        asChild
        trigger={<span className="break-words">{`${formatCompactElapsed(elapsedSince(lastStartedAtIso))} ago`}</span>}
      >
        <div className="flex flex-col gap-0.5">
          <Text.H6 color="foregroundMuted">Last detected at</Text.H6>
          <Text.H6B>{new Date(lastStartedAtIso).toLocaleString()}</Text.H6B>
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

/** Icon + "System" badge, styled like a `TagBadge`, shown next to the slug. */
function SystemTag() {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground select-none">
      <LatitudeLogo className="h-3 w-3" />
      System
    </span>
  )
}

function AlertCard({
  alert,
  monitor,
  onEdit,
  onDelete,
}: {
  readonly alert: MonitorAlertRecord
  readonly monitor: MonitorRecord
  readonly onEdit: () => void
  readonly onDelete: () => void
}) {
  // System monitors only allow editing the issue.escalating sensitivity; user alerts are fully editable.
  const canEdit = !monitor.system || alert.kind === "issue.escalating"
  // The delete control shows on every user-monitor alert, but a monitor must keep
  // at least one — so it's disabled (with a hint) when this is the only alert.
  const deletable = !monitor.system
  const isLastAlert = monitor.alerts.length <= 1

  const deleteButton = (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 px-2"
      disabled={isLastAlert}
      onClick={onDelete}
      aria-label="Delete alert"
    >
      <Icon icon={XIcon} size="sm" />
    </Button>
  )

  const editButton = (
    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onEdit} aria-label="Edit alert">
      <Icon icon={PencilIcon} size="xs" color="foregroundMuted" />
    </Button>
  )

  // Ghost icon buttons add their own height; trim top padding when present so the row stays balanced.
  const hasActions = canEdit || deletable

  return (
    <div
      className={cn("flex flex-col gap-2 rounded-lg border border-border pb-3 pl-3 pr-2", {
        "pt-2": hasActions,
        "pt-3": !hasActions,
      })}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Status
            variant={SEVERITY_VARIANT[alert.severity]}
            label={`${ALERT_INCIDENT_KIND_LABEL[alert.kind]} · ${SEVERITY_LABEL[alert.severity]}`}
          />
          {canEdit ? (
            <Tooltip asChild side="bottom" trigger={<span className="inline-flex shrink-0">{editButton}</span>}>
              Click to edit this alert
            </Tooltip>
          ) : null}
        </div>
        {deletable ? (
          isLastAlert ? (
            <Tooltip asChild side="bottom" trigger={<span className="inline-flex">{deleteButton}</span>}>
              A monitor must have at least one alert
            </Tooltip>
          ) : (
            deleteButton
          )
        ) : null}
      </div>
      <Text.H5>{alert.summary}</Text.H5>
    </div>
  )
}

/** Shown while the monitor list resolves on a deep link, before the panel can mount off it. */
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

          <DetailSection icon={<Icon icon={MegaphoneIcon} size="sm" />} label="Alerts" defaultOpen>
            <div className="flex flex-col gap-2">
              {Array.from({ length: 2 }, (_, i) => (
                <div
                  key={`alert-skeleton-${i}`}
                  className="flex flex-col gap-2 rounded-lg border border-border px-3 pb-3 pt-3"
                >
                  <Skeleton className="h-5 w-44" />
                  <Skeleton className="h-5 w-full" />
                </div>
              ))}
            </div>
          </DetailSection>

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
  // `null` = closed; `{ alert: null }` = add; `{ alert }` = edit that alert.
  const [alertModal, setAlertModal] = useState<{ readonly alert: MonitorAlertRecord | null } | null>(null)
  const [sensitivityAlert, setSensitivityAlert] = useState<MonitorAlertRecord | null>(null)
  const [alertToDelete, setAlertToDelete] = useState<MonitorAlertRecord | null>(null)
  const muted = monitor.mutedAt != null
  const { data: incidentStats, isLoading: statsLoading } = useMonitorIncidentStats({
    projectId,
    monitorId: monitor.id,
  })

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
    [monitor.id, monitor.slug, muted, projectSlug, toast],
  )
  useRegisterCommands(paletteCommands)

  // System monitors only expose the issue.escalating sensitivity (its own modal);
  // every other editable alert is a user saved-search alert (the alert-form modal).
  const onEditAlert = (alert: MonitorAlertRecord) =>
    alert.kind === "issue.escalating" ? setSensitivityAlert(alert) : setAlertModal({ alert })

  useHotkeys([
    { hotkey: "Alt+ArrowDown", callback: () => onNext?.(), options: { enabled: canNavigateNext && !!onNext } },
    { hotkey: "Alt+ArrowUp", callback: () => onPrev?.(), options: { enabled: canNavigatePrev && !!onPrev } },
    { hotkey: "J", callback: () => onNext?.(), options: { enabled: canNavigateNext && !!onNext } },
    { hotkey: "K", callback: () => onPrev?.(), options: { enabled: canNavigatePrev && !!onPrev } },
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
                      lastStartedAtIso={incidentStats.lastStartedAtIso}
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

            <DetailSection icon={<Icon icon={MegaphoneIcon} size="sm" />} label="Alerts" defaultOpen>
              <div className="flex flex-col gap-2">
                {monitor.alerts.map((alert) => (
                  <AlertCard
                    key={alert.id}
                    alert={alert}
                    monitor={monitor}
                    onEdit={() => onEditAlert(alert)}
                    onDelete={() => setAlertToDelete(alert)}
                  />
                ))}
                {!monitor.system ? <AddAlertButton onClick={() => setAlertModal({ alert: null })} /> : null}
              </div>
            </DetailSection>

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

      {alertModal ? (
        <MonitorAlertEditModal
          projectId={projectId}
          projectSlug={projectSlug}
          monitorId={monitor.id}
          alert={alertModal.alert}
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

      {alertToDelete ? (
        <MonitorAlertDeleteConfirmModal
          projectId={projectId}
          monitorId={monitor.id}
          alert={alertToDelete}
          onClose={() => setAlertToDelete(null)}
        />
      ) : null}
    </>
  )
}
