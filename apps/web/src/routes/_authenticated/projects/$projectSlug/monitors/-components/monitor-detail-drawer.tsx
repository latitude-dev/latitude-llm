import { ALERT_INCIDENT_KIND_LABEL } from "@domain/shared"
import {
  Button,
  CopyableText,
  cn,
  DetailDrawer,
  DetailSection,
  Icon,
  LatitudeLogo,
  Status,
  type StatusProps,
  Text,
  Tooltip,
} from "@repo/ui"
import { useHotkeys } from "@tanstack/react-hotkeys"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BellIcon,
  BellOffIcon,
  MegaphoneIcon,
  PencilIcon,
  PlusIcon,
  ShieldAlertIcon,
  XIcon,
} from "lucide-react"
import { useState } from "react"
import { HotkeyBadge } from "../../../../../../components/hotkey-badge.tsx"
import type { MonitorAlertRecord, MonitorRecord } from "../../../../../../domains/monitors/monitors.functions.ts"
import { MonitorAlertDeleteConfirmModal } from "./monitor-alert-delete-confirm-modal.tsx"
import { MonitorAlertEditModal } from "./monitor-alert-edit-modal.tsx"
import { MonitorIncidentsTable } from "./monitor-incidents-table.tsx"
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
  // Every user-monitor alert is editable (its source + severity, plus the
  // threshold/window for the two complex kinds); only `kind` is immutable. The
  // one editable system value is the issue.escalating sensitivity — both open an
  // edit modal (the parent routes by kind).
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

  // The ghost icon buttons add their own height on the right; trim the top
  // padding so the row sits more balanced when they're present.
  const hasActions = canEdit || deletable

  return (
    <div
      className={cn("flex flex-col gap-2 rounded-lg border border-border px-3 pb-3", {
        "pt-2": hasActions,
        "pt-3": !hasActions,
      })}
    >
      <div className="flex items-center justify-between gap-2">
        <Status
          variant={SEVERITY_VARIANT[alert.severity]}
          label={`${ALERT_INCIDENT_KIND_LABEL[alert.kind]} · ${SEVERITY_LABEL[alert.severity]}`}
        />
        <div className="flex items-center gap-1.5">
          {canEdit ? (
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={onEdit} aria-label="Edit alert">
              <Icon icon={PencilIcon} size="sm" />
            </Button>
          ) : null}
          {deletable ? (
            isLastAlert ? (
              <Tooltip asChild side="bottom" trigger={<span className="inline-flex">{deleteButton}</span>}>
                A monitor must keep at least one alert — delete the monitor instead.
              </Tooltip>
            ) : (
              deleteButton
            )
          ) : null}
        </div>
      </div>
      <Text.H5>{alert.summary}</Text.H5>
    </div>
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
  const [muteConfirmOpen, setMuteConfirmOpen] = useState(false)
  // `null` = closed; `{ alert: null }` = add; `{ alert }` = edit that alert.
  const [alertModal, setAlertModal] = useState<{ readonly alert: MonitorAlertRecord | null } | null>(null)
  const [sensitivityAlert, setSensitivityAlert] = useState<MonitorAlertRecord | null>(null)
  const [alertToDelete, setAlertToDelete] = useState<MonitorAlertRecord | null>(null)
  const muted = monitor.mutedAt != null

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
              {monitor.system ? <SystemTag /> : null}
              <CopyableText value={monitor.slug} size="sm" ellipsis tooltip="Copy monitor slug" />
              {muted ? <Status variant="neutral" label="Muted" /> : null}
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
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
                {!monitor.system ? (
                  <div>
                    <Button variant="outline" size="sm" onClick={() => setAlertModal({ alert: null })}>
                      <Icon icon={PlusIcon} size="sm" />
                      Add alert
                    </Button>
                  </div>
                ) : null}
              </div>
            </DetailSection>

            <DetailSection
              icon={<Icon icon={ShieldAlertIcon} size="sm" />}
              label="Incidents"
              defaultOpen
              contentClassName="flex flex-col overflow-hidden pl-0 pt-0 max-h-none"
            >
              <MonitorIncidentsTable monitorId={monitor.id} />
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
