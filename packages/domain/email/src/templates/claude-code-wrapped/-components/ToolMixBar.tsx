// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React from "react"
import { emailDesignTokens } from "../../../tokens/design-system.ts"

export interface ToolMixSegment {
  readonly label: string
  readonly count: number
  readonly color: string
}

interface ToolMixBarProps {
  readonly segments: readonly ToolMixSegment[]
}

const formatPercent = (n: number): string => `${Math.round(n * 100)}%`

/**
 * Horizontal stacked bar showing tool-call distribution. Implemented as a
 * single-row HTML table with each segment as a cell whose width is the
 * percentage — the most reliable way to render proportional bars in Gmail /
 * Outlook without SVG.
 *
 * Below the bar, a legend lists each segment with its percentage.
 */
export function ToolMixBar({ segments }: ToolMixBarProps) {
  const total = segments.reduce((acc, s) => acc + s.count, 0)
  if (total === 0) {
    return (
      <p
        style={{
          fontFamily: emailDesignTokens.fonts.serif,
          fontSize: "14px",
          color: emailDesignTokens.colors.claude.mutedInk,
        }}
      >
        No tool calls recorded.
      </p>
    )
  }
  const visible = segments.filter((s) => s.count > 0)

  return (
    <>
      <table
        cellPadding={0}
        cellSpacing={0}
        border={0}
        role="presentation"
        style={{
          width: "100%",
          borderCollapse: "collapse",
          borderRadius: "8px",
          overflow: "hidden",
          height: "16px",
          backgroundColor: emailDesignTokens.colors.claude.creamDeep,
        }}
      >
        <tbody>
          <tr>
            {visible.map((segment) => {
              const pct = segment.count / total
              return (
                <td
                  key={segment.label}
                  style={{
                    backgroundColor: segment.color,
                    width: `${pct * 100}%`,
                    height: "16px",
                    fontSize: 0,
                    lineHeight: 0,
                  }}
                />
              )
            })}
          </tr>
        </tbody>
      </table>

      <table
        cellPadding={0}
        cellSpacing={0}
        border={0}
        role="presentation"
        style={{ width: "100%", marginTop: "12px", borderCollapse: "collapse" }}
      >
        <tbody>
          {visible.map((segment) => (
            <tr key={segment.label}>
              <td style={{ width: "16px", paddingBottom: "4px", verticalAlign: "middle" }}>
                <span
                  style={{
                    display: "inline-block",
                    width: "10px",
                    height: "10px",
                    borderRadius: "2px",
                    backgroundColor: segment.color,
                  }}
                />
              </td>
              <td
                style={{
                  paddingBottom: "4px",
                  paddingLeft: "8px",
                  fontFamily: emailDesignTokens.fonts.serif,
                  fontSize: "13px",
                  color: emailDesignTokens.colors.claude.ink,
                  verticalAlign: "middle",
                }}
              >
                {segment.label}
              </td>
              <td
                align="right"
                style={{
                  paddingBottom: "4px",
                  fontFamily: emailDesignTokens.fonts.serif,
                  fontSize: "13px",
                  color: emailDesignTokens.colors.claude.mutedInk,
                  verticalAlign: "middle",
                }}
              >
                {formatPercent(segment.count / total)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
