// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React from "react"
import { emailDesignTokens } from "../../../tokens/design-system.ts"

interface HeatmapProps {
  /** 7 rows (Mon..Sun UTC) × 24 cols (0..23). */
  readonly cells: ReadonlyArray<readonly number[]>
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const

/** Hours we label on the column axis — every 6h to keep the row narrow. */
const LABELED_HOURS = new Set([0, 6, 12, 18])

const MAX = (cells: ReadonlyArray<readonly number[]>): number => {
  let m = 0
  for (const row of cells) {
    for (const v of row) if (v > m) m = v
  }
  return m
}

/**
 * Linearly interpolates a hex color along the cream→accent ramp using the
 * value's share of the per-week maximum. We hand-compute the channel mix so
 * we don't depend on a CSS color function some clients don't support.
 */
const colorFor = (value: number, max: number): string => {
  if (max <= 0 || value <= 0) return emailDesignTokens.colors.claude.cream
  const t = Math.min(1, value / max)
  // cream #F0EEE6 → accent #D97555
  const r = Math.round(0xf0 + (0xd9 - 0xf0) * t)
  const g = Math.round(0xee + (0x75 - 0xee) * t)
  const b = Math.round(0xe6 + (0x55 - 0xe6) * t)
  return `rgb(${r}, ${g}, ${b})`
}

/**
 * 7×24 activity grid. Each cell is a small colored `<td>` — Outlook handles
 * fixed-width cells well, so we set explicit pixel widths.
 *
 * A single-line caption is rendered above the grid noting that times are
 * UTC. Users in different timezones still see the *shape* of their week
 * correctly (weekend vs. weekday, evening vs. morning), just offset.
 */
export function Heatmap({ cells }: HeatmapProps) {
  const max = MAX(cells)
  return (
    <>
      <p
        style={{
          fontFamily: emailDesignTokens.fonts.serif,
          fontSize: "12px",
          color: emailDesignTokens.colors.claude.mutedInk,
          marginTop: 0,
          marginBottom: "10px",
        }}
      >
        Times shown in UTC.
      </p>
      <table
        cellPadding={0}
        cellSpacing={2}
        border={0}
        role="presentation"
        style={{ borderCollapse: "separate", borderSpacing: "2px" }}
      >
        <tbody>
          {cells.map((row, dayIndex) => (
            <tr key={DAY_LABELS[dayIndex]}>
              <td
                style={{
                  fontFamily: emailDesignTokens.fonts.serif,
                  fontSize: "11px",
                  color: emailDesignTokens.colors.claude.mutedInk,
                  paddingRight: "8px",
                  textAlign: "right",
                  verticalAlign: "middle",
                  width: "32px",
                }}
              >
                {DAY_LABELS[dayIndex]}
              </td>
              {row.map((value, hour) => (
                <td
                  key={`${dayIndex}-${hour}`}
                  title={`${DAY_LABELS[dayIndex]} ${hour}:00 — ${value}`}
                  style={{
                    width: "16px",
                    height: "16px",
                    backgroundColor: colorFor(value, max),
                    borderRadius: "3px",
                    fontSize: 0,
                    lineHeight: 0,
                  }}
                />
              ))}
            </tr>
          ))}
          <tr>
            <td />
            {Array.from({ length: 24 }, (_, h) => (
              <td
                key={`h${h}`}
                style={{
                  fontFamily: emailDesignTokens.fonts.serif,
                  fontSize: "9px",
                  color: emailDesignTokens.colors.claude.mutedInk,
                  textAlign: "center",
                  paddingTop: "4px",
                }}
              >
                {LABELED_HOURS.has(h) ? `${h}` : ""}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </>
  )
}
