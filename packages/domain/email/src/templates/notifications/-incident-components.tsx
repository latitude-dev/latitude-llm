import type { IncidentSampleExcerpt } from "@domain/notifications"
import type { AlertSeverity } from "@domain/shared"
import { Img, Row, Section, Text } from "@react-email/components"
import type { ReactNode } from "react"
// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React from "react"

/**
 * Small all-caps eyebrow label + thin divider that visually separates
 * the email's sections (matches Sentry's `ISSUE` / `EXCEPTION` headers).
 */
export function SectionHeader({ label }: { readonly label: string }) {
  return (
    <Section style={{ marginTop: 24, marginBottom: 12 }}>
      <Text
        style={{
          margin: 0,
          color: "#64748B",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </Text>
      <div style={{ marginTop: 6, height: 1, backgroundColor: "#E5E7EB" }} />
    </Section>
  )
}

/**
 * Key-value table used to present structured metadata (Project /
 * Severity / Tags / …). Renders as a two-column HTML table so layout
 * holds up in every mail client; keys sit in a narrow grey column and
 * values flow next to them.
 */
export function EmailMetadataTable({
  rows,
}: {
  readonly rows: ReadonlyArray<{ readonly label: string; readonly value: ReactNode }>
}) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
      <tbody>
        {rows.map(({ label, value }) => (
          <tr key={label}>
            <td
              style={{
                padding: "8px 12px",
                backgroundColor: "#F8FAFC",
                color: "#64748B",
                fontSize: 13,
                width: 120,
                verticalAlign: "top",
                borderRadius: "6px 0 0 6px",
              }}
            >
              {label}
            </td>
            <td
              style={{
                padding: "8px 12px",
                backgroundColor: "#FFFFFF",
                border: "1px solid #F1F5F9",
                color: "#0F172A",
                fontSize: 13,
                verticalAlign: "top",
              }}
            >
              {value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/**
 * Colored severity pill. Medium = amber, high = red. AlertSeverity is
 * a closed set of two today; if a third is added, this falls back to
 * the medium styling and the build doesn't break.
 */
export function SeverityBadge({ severity }: { readonly severity: AlertSeverity }) {
  const palette = severity === "high" ? { bg: "#FEE2E2", fg: "#991B1B" } : { bg: "#FEF3C7", fg: "#92400E" }
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        backgroundColor: palette.bg,
        color: palette.fg,
        fontSize: 12,
        fontWeight: 600,
        textTransform: "capitalize",
      }}
    >
      {severity}
    </span>
  )
}

/**
 * Inline tag chips for the metadata table's "Tags" value cell. Compact
 * style — wraps if the row is narrow.
 */
export function TagsChips({ tags }: { readonly tags: readonly string[] }) {
  if (tags.length === 0) return null
  return (
    <Row>
      {tags.map((tag) => (
        <td key={tag} style={{ width: "auto", paddingRight: 6 }}>
          <span
            style={{
              display: "inline-block",
              padding: "2px 8px",
              borderRadius: 999,
              backgroundColor: "#F1F5F9",
              color: "#0F172A",
              fontSize: 12,
              lineHeight: "16px",
              whiteSpace: "nowrap",
            }}
          >
            {tag}
          </span>
        </td>
      ))}
    </Row>
  )
}

/**
 * Quoted excerpt block — annotation `rawFeedback` or evaluation
 * `feedback`. Helps the recipient triage the incident from inbox
 * without clicking through. Used by both event-kind and
 * sustained-opened emails.
 */
export function SampleExcerptCard({ excerpt }: { readonly excerpt: IncidentSampleExcerpt }) {
  const sourceLabel = excerpt.source === "annotation" ? "From an annotation" : "From automatic evaluation"
  return (
    <Section
      style={{
        marginTop: 8,
        padding: "12px 14px",
        backgroundColor: "#F8FAFC",
        borderLeft: "3px solid #CBD5E1",
        borderRadius: 6,
      }}
    >
      <Text style={{ margin: 0, color: "#64748B", fontSize: 11, fontWeight: 600, textTransform: "uppercase" }}>
        {sourceLabel}
      </Text>
      <Text style={{ margin: "4px 0 0 0", color: "#0F172A", fontSize: 14, lineHeight: "20px" }}>
        {excerpt.text}
        {excerpt.truncated ? "…" : ""}
      </Text>
    </Section>
  )
}

/**
 * Inline trend chart. The image points at the `apps/api`
 * `/charts/incident-trend` endpoint scoped to the notification.
 * Width/height match the renderer (600×200) so the `<Img>` reserves
 * the right slot when mail clients render before the image loads.
 */
export function IncidentTrendChartImage({ src }: { readonly src: string }) {
  return (
    <Section style={{ marginTop: 12 }}>
      <Img
        src={src}
        alt="Incident trend chart"
        width="600"
        height="200"
        style={{
          display: "block",
          width: "100%",
          maxWidth: 600,
          height: "auto",
          borderRadius: 6,
          border: "1px solid #E5E7EB",
        }}
      />
    </Section>
  )
}

/**
 * Heading-area block: timestamp on the left, short id on the right.
 * Renders as a two-column row to match the Sentry email's
 * "Sept. 30, 2025, 10:05 a.m. UTC      ID: 5741644..." line.
 */
export function TimestampIdRow({ timestamp, id }: { readonly timestamp: Date; readonly id: string }) {
  const formatted = formatEmailTimestamp(timestamp)
  // Short id: last 8 chars — enough to reference in a support thread,
  // not so long the line breaks awkwardly.
  const shortId = id.length > 8 ? `…${id.slice(-8)}` : id
  return (
    <table style={{ width: "100%", marginTop: 12 }}>
      <tbody>
        <tr>
          <td style={{ color: "#64748B", fontSize: 12 }}>{formatted}</td>
          <td style={{ color: "#64748B", fontSize: 12, textAlign: "right", fontFamily: "monospace" }}>ID: {shortId}</td>
        </tr>
      </tbody>
    </table>
  )
}

const TIMESTAMP_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
})

/** Absolute timestamp formatter for emails — "Mar 18, 2026, 10:05 UTC". */
function formatEmailTimestamp(date: Date): string {
  return TIMESTAMP_FORMATTER.format(date)
}

/**
 * Single-line "X/hr" rate formatter shared between the email and the
 * chart caption. Rounds to integer for clean copy; sub-1 rates render
 * as one decimal place (e.g. 0.5/hr) since rounding to 0 would be
 * misleading.
 */
export const formatRatePerHour = (rate: number): string => {
  if (rate < 1) return `${rate.toFixed(1)}/hr`
  return `${Math.round(rate)}/hr`
}

/**
 * Humanizes a duration in ms for the recovery copy ("elevated for
 * 32m"). Bands are coarse on purpose — exact second-precision is
 * noise for an email summary.
 */
export const humanizeDurationMs = (ms: number): string => {
  if (ms < 60_000) return "under a minute"
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes}m`
  const hours = minutes / 60
  if (hours < 24) {
    const rounded = Math.round(hours * 10) / 10
    return `${rounded}h`
  }
  const days = Math.round(hours / 24)
  return `${days}d`
}

/**
 * Builds the "{orgName} / {projectName}" string used in the heading
 * subtitle and the metadata table. Project may be null — fall back to
 * org-only.
 */
export const formatScope = (organizationName: string, projectName: string | undefined): string =>
  projectName ? `${organizationName} / ${projectName}` : organizationName
