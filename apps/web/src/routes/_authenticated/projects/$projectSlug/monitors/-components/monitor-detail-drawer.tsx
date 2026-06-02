import { ALERT_INCIDENT_KIND_LABEL } from "@domain/shared"
import {
  Button,
  CopyableText,
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
import { ArrowDownIcon, ArrowUpIcon, BellIcon, BellOffIcon, MegaphoneIcon, ShieldAlertIcon } from "lucide-react"
import { useState } from "react"
import { HotkeyBadge } from "../../../../../../components/hotkey-badge.tsx"
import type { MonitorAlertRecord, MonitorRecord } from "../../../../../../domains/monitors/monitors.functions.ts"
import { MonitorIncidentsTable } from "./monitor-incidents-table.tsx"
import { MonitorMuteConfirmModal } from "./monitor-mute-confirm-modal.tsx"

const SEVERITY_VARIANT: Record<MonitorAlertRecord["severity"], StatusProps["variant"]> = {
  low: "neutral",
  medium: "warning",
  high: "destructive",
}

/** Icon + "System" badge, styled like a `TagBadge`, shown next to the slug. */
function SystemTag() {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
      <LatitudeLogo className="h-3 w-3" />
      System
    </span>
  )
}

// Read-only in M4 — editing an alert's configurable values (the issue.escalating
// sensitivity control + the saved-search threshold/window forms) lands in M5
// alongside the shared alert-form components.
function AlertCard({ alert }: { readonly alert: MonitorAlertRecord }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <Text.H6 color="foregroundMuted" noWrap>
          {ALERT_INCIDENT_KIND_LABEL[alert.kind]}
        </Text.H6>
        <Status variant={SEVERITY_VARIANT[alert.severity]} label={alert.severity} />
      </div>
      <Text.H5>{alert.summary}</Text.H5>
    </div>
  )
}

export function MonitorDetailDrawer({
  projectId,
  monitor,
  onClose,
  onNext,
  onPrev,
  canNavigateNext,
  canNavigatePrev,
}: {
  readonly projectId: string
  readonly monitor: MonitorRecord
  readonly onClose: () => void
  readonly onNext?: () => void
  readonly onPrev?: () => void
  readonly canNavigateNext: boolean
  readonly canNavigatePrev: boolean
}) {
  const [muteConfirmOpen, setMuteConfirmOpen] = useState(false)
  const muted = monitor.mutedAt != null

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
                  <AlertCard key={alert.id} alert={alert} />
                ))}
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
    </>
  )
}
