import { ALERT_SEVERITIES, type AlertSeverity, SEVERITY_COLOR } from "@domain/shared"
import { DotIndicator, Status, type StatusProps, type TabOption, Tabs, type TabsProps } from "@repo/ui"
import { SEVERITY_LABELS } from "./incident-markers.ts"

// Dots use the shared severity palette, so the selector previews the exact
// color the incident carries on charts, Slack bars and email badges.
const severityDot = (severity: AlertSeverity) => (
  <DotIndicator size="md" style={{ background: SEVERITY_COLOR[severity] }} />
)

const OPTIONS: readonly TabOption<AlertSeverity>[] = ALERT_SEVERITIES.map((severity) => ({
  id: severity,
  label: SEVERITY_LABELS[severity],
  icon: severityDot(severity),
}))

/**
 * Compact dot cluster — one canonical-palette dot per alert severity, capped
 * with a `+N` overflow. Used as the "monitored" signal (e.g. the traces-page
 * saved-search chip).
 */
export function SeverityDots({ severities, max = 4 }: { readonly severities: readonly AlertSeverity[]; max?: number }) {
  const shown = severities.slice(0, max)
  const overflow = severities.length - shown.length
  return (
    <span className="flex items-center gap-1">
      {shown.map((severity, index) => (
        // Dots are positional + presentational; severities can repeat, so the index is the identity.
        <DotIndicator key={index} size="md" style={{ background: SEVERITY_COLOR[severity] }} />
      ))}
      {overflow > 0 ? <span className="text-muted-foreground text-xs">+{overflow}</span> : null}
    </span>
  )
}

// Nearest Status tint per severity — the dot itself carries the exact canonical color.
const SEVERITY_STATUS_VARIANT: Record<AlertSeverity, StatusProps["variant"]> = {
  low: "info",
  medium: "warning",
  high: "destructive",
}

/**
 * Status pill for a severity (e.g. the monitor drawer's alert badges): the
 * dot uses the canonical {@link SEVERITY_COLOR} palette; pill tint/text use
 * the closest Status variant so dark mode keeps working.
 */
export function SeverityStatus({ severity, label }: { readonly severity: AlertSeverity; readonly label?: string }) {
  return (
    <Status
      variant={SEVERITY_STATUS_VARIANT[severity]}
      label={label ?? SEVERITY_LABELS[severity]}
      indicator={<DotIndicator size="sm" style={{ background: SEVERITY_COLOR[severity] }} />}
    />
  )
}

/**
 * Compact, selection-reactive hint for a minimum-severity threshold —
 * spells out the progressive semantics without introducing extra concepts.
 */
export const minSeverityHint = (minimum: AlertSeverity): string => {
  if (minimum === "low") return "All severities"
  if (minimum === "medium") return "Medium and high"
  return "High only"
}

/**
 * Low/Medium/High picker with the canonical severity colors. Used both to set
 * an alert's severity (alert forms) and as a progressive minimum-severity
 * threshold for delivery (email / Slack settings) — the surrounding copy
 * carries the semantics.
 */
export function SeveritySelector({
  value,
  onSelect,
  disabled,
  variant = "secondary",
}: {
  readonly value: AlertSeverity
  readonly onSelect: (severity: AlertSeverity) => void
  readonly disabled?: boolean
  readonly variant?: TabsProps<AlertSeverity>["variant"]
}) {
  return (
    <Tabs<AlertSeverity>
      variant={variant}
      size="sm"
      options={OPTIONS}
      active={value}
      onSelect={(severity) => {
        if (!disabled) onSelect(severity)
      }}
    />
  )
}
