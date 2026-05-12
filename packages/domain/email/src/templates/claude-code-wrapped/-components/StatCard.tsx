// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React from "react"
import { emailDesignTokens } from "../../../tokens/design-system.ts"

interface StatCardProps {
  readonly label: string
  readonly value: string
  readonly caption?: string
}

/**
 * One tile in the headline-numbers grid. Pure HTML/CSS so it renders the same
 * everywhere — no Tailwind on the number itself (we want exact font weight
 * and size control).
 */
export function StatCard({ label, value, caption }: StatCardProps) {
  return (
    <td
      align="center"
      valign="middle"
      style={{
        padding: "20px 12px",
        backgroundColor: emailDesignTokens.colors.white,
        border: `1px solid ${emailDesignTokens.colors.claude.creamDeep}`,
        borderRadius: "8px",
        width: "25%",
      }}
    >
      <div
        style={{
          fontFamily: emailDesignTokens.fonts.serif,
          fontSize: "11px",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: emailDesignTokens.colors.claude.mutedInk,
          marginBottom: "6px",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: emailDesignTokens.fonts.serif,
          fontSize: "28px",
          lineHeight: "32px",
          fontWeight: 500,
          color: emailDesignTokens.colors.claude.ink,
        }}
      >
        {value}
      </div>
      {caption ? (
        <div
          style={{
            fontFamily: emailDesignTokens.fonts.serif,
            fontSize: "11px",
            color: emailDesignTokens.colors.claude.mutedInk,
            marginTop: "4px",
          }}
        >
          {caption}
        </div>
      ) : null}
    </td>
  )
}
