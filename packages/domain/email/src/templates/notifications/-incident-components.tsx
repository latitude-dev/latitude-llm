import type { IncidentSampleExcerpt } from "@domain/notifications"
import { Row, Section, Text } from "@react-email/components"
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

