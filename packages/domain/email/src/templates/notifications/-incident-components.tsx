import type { IncidentSampleExcerpt } from "@domain/notifications"
import { Img, Row, Section, Text } from "@react-email/components"
// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React from "react"

/**
 * Shared row-of-chips used across incident emails. Inline rather than
 * pulled into `@repo/email/components` because tag chips are specific
 * to incident templates today — promoting to a shared component is
 * easy once a second surface needs them.
 */
export function TagsChips({ tags }: { readonly tags: readonly string[] }) {
  if (tags.length === 0) return null
  return (
    <Section className="mt-4">
      <Row>
        {tags.map((tag) => (
          <td
            key={tag}
            // Inline display so multiple chips flow horizontally in the
            // same row. Width "auto" forces the cell to size to its
            // content. Spacing handled per-chip via padding/margin.
            style={{ width: "auto", paddingRight: 6 }}
          >
            <span
              style={{
                display: "inline-block",
                padding: "3px 8px",
                borderRadius: 999,
                backgroundColor: "#F1F5F9",
                color: "#0F172A",
                fontSize: 12,
                lineHeight: "16px",
                fontWeight: 500,
                whiteSpace: "nowrap",
              }}
            >
              {tag}
            </span>
          </td>
        ))}
      </Row>
    </Section>
  )
}

/**
 * Quoted excerpt block — annotation `rawFeedback` or evaluation
 * `feedback`. Helps the recipient triage the incident from inbox
 * without clicking through.
 */
export function SampleExcerptCard({ excerpt }: { readonly excerpt: IncidentSampleExcerpt }) {
  const sourceLabel = excerpt.source === "annotation" ? "From an annotation" : "From automatic evaluation"
  return (
    <Section
      style={{
        marginTop: 16,
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
 * `/charts/incident-trend` endpoint scoped to the notification via an
 * HMAC-signed token. Width/height match the renderer (600×200) so the
 * `<Img>` reserves the right slot when mail clients render before the
 * image loads, and the alt text reads sensibly in plain-text clients.
 */
export function IncidentTrendChartImage({ src }: { readonly src: string }) {
  return (
    <Section style={{ marginTop: 16 }}>
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
