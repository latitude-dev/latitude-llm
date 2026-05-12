// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React, { type ReactNode } from "react"
import { emailDesignTokens } from "../../../tokens/design-system.ts"

interface RankListItem {
  readonly primary: string
  readonly secondary?: string | null
  readonly trailing: ReactNode
}

interface RankListProps {
  readonly items: readonly RankListItem[]
  /** Shown when items is empty. */
  readonly emptyHint?: string
}

/**
 * Numbered list with a primary label, optional muted secondary line, and a
 * trailing value (count, branch, etc.). Used for top files / commands /
 * branches.
 */
export function RankList({ items, emptyHint = "—" }: RankListProps) {
  if (items.length === 0) {
    return (
      <p
        style={{
          fontFamily: emailDesignTokens.fonts.serif,
          fontSize: "14px",
          color: emailDesignTokens.colors.claude.mutedInk,
        }}
      >
        {emptyHint}
      </p>
    )
  }
  return (
    <table
      cellPadding={0}
      cellSpacing={0}
      border={0}
      role="presentation"
      style={{ width: "100%", borderCollapse: "collapse" }}
    >
      <tbody>
        {items.map((item, index) => (
          <tr key={`${index}-${item.primary}`}>
            <td
              valign="top"
              style={{
                width: "24px",
                paddingTop: "8px",
                paddingBottom: "8px",
                fontFamily: emailDesignTokens.fonts.serif,
                fontSize: "13px",
                color: emailDesignTokens.colors.claude.mutedInk,
                borderBottom: `1px solid ${emailDesignTokens.colors.claude.creamDeep}`,
              }}
            >
              {`0${index + 1}`.slice(-2)}
            </td>
            <td
              valign="top"
              style={{
                paddingTop: "8px",
                paddingBottom: "8px",
                paddingLeft: "12px",
                borderBottom: `1px solid ${emailDesignTokens.colors.claude.creamDeep}`,
              }}
            >
              <div
                style={{
                  fontFamily: emailDesignTokens.fonts.serif,
                  fontSize: "15px",
                  lineHeight: "20px",
                  color: emailDesignTokens.colors.claude.ink,
                }}
              >
                {item.primary}
              </div>
              {item.secondary ? (
                <div
                  style={{
                    fontFamily: emailDesignTokens.fonts.serif,
                    fontSize: "12px",
                    color: emailDesignTokens.colors.claude.mutedInk,
                    marginTop: "2px",
                  }}
                >
                  {item.secondary}
                </div>
              ) : null}
            </td>
            <td
              valign="top"
              align="right"
              style={{
                paddingTop: "8px",
                paddingBottom: "8px",
                fontFamily: emailDesignTokens.fonts.serif,
                fontSize: "13px",
                color: emailDesignTokens.colors.claude.mutedInk,
                borderBottom: `1px solid ${emailDesignTokens.colors.claude.creamDeep}`,
                whiteSpace: "nowrap",
              }}
            >
              {item.trailing}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
